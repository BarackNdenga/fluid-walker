// Vertex shader du post-process (quad fullscreen)
export const postVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Fragment shader : chromatic aberration + shockwaves + bloom simulé
export const postFragment = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform sampler2D tDiffuse;
uniform float uTime;
uniform float uBass;
// Shockwaves : on en stocke jusqu'à 5 (x, y, age, strength, 0)
uniform vec4 uShock[5];
uniform int  uShockCount;

void main() {
  vec2 uv = vUv;
  vec2 center = vec2(0.5);

  // --- Distorsion par shockwaves ---
  vec2 offset = vec2(0.0);
  float shockEnergy = 0.0;
  for (int i = 0; i < 5; i++){
    if (i >= uShockCount) break;
    vec4 s = uShock[i];
    // s.xy = centre (UV), s.z = âge (0..1), s.w = force
    float age = s.z;
    if (age > 1.0) continue;
    float radius = age * 0.9; // l'onde s'étend
    float falloff = 1.0 - age; // s'affaiblit
    vec2 dir = uv - s.xy;
    float d = length(dir);
    // Anneau : plus fort sur un rayon précis
    float ring = exp(-pow((d - radius) * 14.0, 2.0));
    float strength = ring * falloff * s.w;
    offset += normalize(dir + 1e-5) * strength * 0.025;
    shockEnergy += strength;
  }

  // Légère distorsion globale sur les kicks
  offset += (uv - center) * uBass * 0.012;

  vec2 uvR = uv + offset * 1.15;
  vec2 uvG = uv + offset * 1.0;
  vec2 uvB = uv + offset * 0.85;

  // --- Chromatic aberration amplifiée sur les bords des shockwaves ---
  float aber = 0.0015 + shockEnergy * 0.02 + uBass * 0.003;
  vec2 dir = (uv - center);
  float r = texture2D(tDiffuse, uvR + dir * aber).r;
  float g = texture2D(tDiffuse, uvG).g;
  float b = texture2D(tDiffuse, uvB - dir * aber).b;
  vec3 col = vec3(r, g, b);

  // --- Bloom simulé (multi-pass simple : 5 taps élargis sur les zones brillantes) ---
  vec3 bloom = vec3(0.0);
  float threshold = 0.85;
  for (int i = 1; i <= 6; i++){
    float fi = float(i);
    float s = fi * 0.003 * (1.0 + shockEnergy * 3.0);
    vec3 a = texture2D(tDiffuse, uv + vec2( s, 0.0)).rgb;
    vec3 bb = texture2D(tDiffuse, uv + vec2(-s, 0.0)).rgb;
    vec3 c = texture2D(tDiffuse, uv + vec2(0.0,  s)).rgb;
    vec3 d = texture2D(tDiffuse, uv + vec2(0.0, -s)).rgb;
    vec3 sum = a + bb + c + d;
    bloom += max(sum - vec3(threshold), vec3(0.0)) * (1.0 / fi);
  }
  col += bloom * 0.12;

  // --- Fine grain cinématographique ---
  float grain = fract(sin(dot(uv * uTime, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.03;

  gl_FragColor = vec4(col, 1.0);
}
`;
