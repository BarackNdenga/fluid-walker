// Vertex shader : un simple quad fullscreen
export const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

// Fragment shader : raymarcher SDF complet
export const fragmentShader = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform float uTime;
uniform vec2  uResolution;
uniform vec2  uMouse;        // -1..1
uniform float uBass;         // 0..1 intensité basses
uniform float uMid;          // 0..1 intensité mediums
uniform float uHigh;         // 0..1 intensité aigus
uniform float uGravityFlip;  // 0..1 (inversion de gravité)
uniform float uStep;         // 0..1 pulsation à chaque pas

// ===================================================================
// BRUIT SIMPLEX 3D (Inigo Quilez / Ashima)
// ===================================================================
vec3 mod289(vec3 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 mod289(vec4 x){ return x - floor(x * (1.0/289.0)) * 289.0; }
vec4 permute(vec4 x){ return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r){ return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v){
  const vec2  C = vec2(1.0/6.0, 1.0/3.0);
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}

// ===================================================================
// PRIMITIVES SDF
// ===================================================================
float sdSphere(vec3 p, float r){ return length(p) - r; }

float sdCapsule(vec3 p, vec3 a, vec3 b, float r){
  vec3 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba*h) - r;
}

float sdEllipsoid(vec3 p, vec3 r){
  float k0 = length(p / r);
  float k1 = length(p / (r*r));
  return k0 * (k0 - 1.0) / k1;
}

// Smooth union polynomial (Iñigo Quílez)
float smin(float a, float b, float k){
  float h = clamp(0.5 + 0.5*(b-a)/k, 0.0, 1.0);
  return mix(b, a, h) - k*h*(1.0-h);
}

float smax(float a, float b, float k){
  return -smin(-a, -b, k);
}

// ===================================================================
// SILHOUETTE HUMAINE ANIMÉE
// ===================================================================
// Retourne la distance à la silhouette. Le marcheur avance vers la caméra
// mais on le garde dans une zone cadrée (effet tapis-roulant).
float sdHuman(vec3 p){
  // --- Mouvement de marche ---
  float t = uTime * 1.4;
  float walk = sin(t);
  float walk2 = sin(t * 2.0);

  // Gravité inversée : la silhouette flotte
  float grav = mix(0.0, 0.4, uGravityFlip);

  // --- Twist par la souris : torsion autour de Y ---
  float twistAmount = uMouse.x * 1.2;
  float twistAngle = p.y * twistAmount * 0.6;
  float cs = cos(twistAngle), sn = sin(twistAngle);
  p.xz = mat2(cs, -sn, sn, cs) * p.xz;

  // --- Déplacement vertical par la souris Y + gravité ---
  p.y -= uMouse.y * 0.25;
  p.y -= grav;

  // --- Éclaboussure de la tête sur les kicks ---
  float kickSplash = uBass * 0.25;

  // --- Position des membres ---
  float legSwing = walk * 0.45;
  float armSwing = -walk * 0.55;

  // Torse
  float torso = sdCapsule(p, vec3(0.0, 0.15, 0.0), vec3(0.0, 0.95, 0.0), 0.22);
  // Hanches
  float hips  = sdEllipsoid(p - vec3(0.0, 0.1, 0.0), vec3(0.28, 0.18, 0.22));
  // Cou
  float neck  = sdCapsule(p, vec3(0.0, 0.95, 0.0), vec3(0.0, 1.1, 0.0), 0.09);
  // Tête
  vec3 headP = p - vec3(0.0, 1.28 + kickSplash*0.05, 0.0);
  float head = sdEllipsoid(headP, vec3(0.16, 0.20, 0.18));
  // Éclaboussure de tête : couronne de petites sphères
  for (int i = 0; i < 6; i++){
    float a = float(i) / 6.0 * 6.2831 + uTime*0.5;
    vec3 dp = vec3(cos(a), 0.6, sin(a)) * kickSplash;
    head = smin(head, sdSphere(p - vec3(0.0, 1.32, 0.0) - dp, 0.05 + 0.04*uBass), 0.08);
  }

  // Jambes (avec oscillation)
  vec3 legL_a = vec3(-0.12, 0.1, 0.0);
  vec3 legL_b = vec3(-0.12, -0.75, 0.0) + vec3(0.0, 0.0, legSwing);
  vec3 legR_a = vec3( 0.12, 0.1, 0.0);
  vec3 legR_b = vec3( 0.12, -0.75, 0.0) - vec3(0.0, 0.0, legSwing);
  float legL = sdCapsule(p, legL_a, legL_b, 0.11);
  float legR = sdCapsule(p, legR_a, legR_b, 0.11);

  // Bras
  vec3 armL_a = vec3(-0.25, 0.85, 0.0);
  vec3 armL_b = vec3(-0.32, 0.15, 0.0) - vec3(0.0, 0.0, armSwing);
  vec3 armR_a = vec3( 0.25, 0.85, 0.0);
  vec3 armR_b = vec3( 0.32, 0.15, 0.0) + vec3(0.0, 0.0, armSwing);
  float armL = sdCapsule(p, armL_a, armL_b, 0.08);
  float armR = sdCapsule(p, armR_a, armR_b, 0.08);

  // Assemblage avec smooth union pour un aspect fondu/liquide
  float body = smin(torso, hips, 0.15);
  body = smin(body, neck, 0.08);
  body = smin(body, head, 0.08);
  body = smin(body, legL, 0.10);
  body = smin(body, legR, 0.10);
  body = smin(body, armL, 0.08);
  body = smin(body, armR, 0.08);

  // --- Perturbation plasma 4D (bruit) ---
  // La 4ème dimension = temps : la surface ondule sans cesse
  float n1 = snoise(p * 2.2 + vec3(0.0, uTime*0.8, 0.0));
  float n2 = snoise(p * 5.0 - vec3(uTime*0.4, 0.0, uTime*0.3));
  float plasmaDisp = (n1 * 0.045 + n2 * 0.020) * (1.0 + uBass * 1.5);
  body += plasmaDisp;

  return body;
}

// Sol miroir (plan y = -0.85)
float sdGround(vec3 p){
  return p.y + 0.85;
}

// Scène complète
float map(vec3 p){
  float human = sdHuman(p);
  float ground = sdGround(p);
  return min(human, ground);
}

// ===================================================================
// RAYMARCHING
// ===================================================================
vec3 calcNormal(vec3 p){
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)
  ));
}

float raymarch(vec3 ro, vec3 rd, out float t, out int hitType){
  t = 0.0;
  hitType = 0; // 0 = rien, 1 = silhouette, 2 = sol
  for (int i = 0; i < 96; i++){
    vec3 p = ro + rd * t;
    float dHuman = sdHuman(p);
    float dGround = sdGround(p);
    float d = min(dHuman, dGround);
    if (d < 0.0015){
      hitType = (dHuman < dGround) ? 1 : 2;
      return 1.0;
    }
    t += d * 0.9;
    if (t > 40.0) break;
  }
  return 0.0;
}

// ===================================================================
// MATÉRIAU MÉTAL LIQUIDE
// ===================================================================
vec3 materialLiquid(vec3 p, vec3 n, vec3 rd){
  // Couleur de base influencée par la souris (teinte)
  float hueShift = uMouse.x * 0.5 + 0.1;
  vec3 baseColor = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + hueShift));

  // Plasma 4D : incandescence qui circule
  float plasma = snoise(p * 3.0 + vec3(uTime * 0.6));
  float plasma2 = snoise(p * 7.0 - vec3(uTime * 1.1, 0.0, uTime * 0.7));
  float heat = smoothstep(-0.3, 0.9, plasma) * 0.9 + plasma2 * 0.15;

  // Fresnel (effet métallique)
  float fres = pow(1.0 - max(dot(-rd, n), 0.0), 3.0);

  // Reflet environnemental approximé
  vec3 refl = reflect(rd, n);
  vec3 env = mix(vec3(0.02, 0.03, 0.07), vec3(0.9, 0.6, 0.2), smoothstep(-0.4, 0.6, refl.y));

  // Incandescence : orange → blanc
  vec3 incand = mix(vec3(0.8, 0.2, 0.05), vec3(1.4, 1.1, 0.6), heat);
  incand = mix(incand, vec3(1.6, 1.5, 1.3), pow(heat, 3.0));

  // Réponse audio : pulsations lumineuses
  incand += vec3(1.2, 0.5, 0.2) * uBass * 1.5;
  incand += vec3(0.2, 0.8, 1.2) * uHigh * 0.8;

  vec3 color = mix(baseColor * 0.4, incand, heat);
  color = mix(color, env, fres * 0.7);
  color += vec3(1.0, 0.8, 0.5) * pow(fres, 4.0) * (0.8 + uBass);

  return color;
}

vec3 materialGround(vec3 p, vec3 n, vec3 rd){
  // Sol miroir sombre avec grille
  float gx = smoothstep(0.96, 1.0, abs(fract(p.x * 0.5) - 0.5) * 2.0);
  float gz = smoothstep(0.96, 1.0, abs(fract(p.z * 0.5) - 0.5) * 2.0);
  float grid = max(gx, gz);

  vec3 base = vec3(0.01, 0.015, 0.03);
  float fres = pow(1.0 - max(dot(-rd, n), 0.0), 4.0);

  // Onde de choc au sol : pulse circulaire
  float ring = abs(length(p.xz) - mod(uTime * 2.5, 8.0));
  float shock = smoothstep(0.3, 0.0, ring) * 0.6;

  vec3 color = base + vec3(0.3, 0.5, 0.9) * grid * 0.4;
  color += vec3(1.0, 0.6, 0.2) * shock * (1.0 + uBass);
  color += vec3(0.6, 0.4, 1.0) * fres * 0.3;
  return color;
}

// ===================================================================
// MAIN
// ===================================================================
void main(){
  vec2 uv = (gl_FragCoord.xy - 0.5 * uResolution.xy) / uResolution.y;

  // Caméra : légère oscillation + recul
  float camT = uTime * 0.15;
  vec3 ro = vec3(sin(camT) * 0.3, 0.5 + uMouse.y * 0.2, -3.2);
  vec3 ta = vec3(0.0, 0.5, 0.0);
  vec3 fwd = normalize(ta - ro);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec3 rd = normalize(uv.x * right + uv.y * up + 1.3 * fwd);

  float t; int hitType;
  float hit = raymarch(ro, rd, t, hitType);

  vec3 col;
  if (hit > 0.5){
    vec3 p = ro + rd * t;
    vec3 n = calcNormal(p);
    if (hitType == 1){
      // Réflexion sol : pour la silhouette, on ajoute un reflet du "ciel"
      col = materialLiquid(p, n, rd);
    } else {
      // Sol miroir : on raymarche une deuxième fois en réfléchissant
      vec3 reflRd = reflect(rd, n);
      vec3 reflRo = p + n * 0.01;
      float t2; int hit2;
      float hitR = raymarch(reflRo, reflRd, t2, hit2);
      vec3 reflCol = vec3(0.01, 0.02, 0.04); // ciel sombre
      if (hitR > 0.5 && hit2 == 1){
        vec3 p2 = reflRo + reflRd * t2;
        vec3 n2 = calcNormal(p2);
        reflCol = materialLiquid(p2, n2, reflRd);
      }
      vec3 groundBase = materialGround(p, n, rd);
      // Fresnel du sol (plus on regarde en rasant, plus ça reflète)
      float fresG = pow(1.0 - max(dot(-rd, n), 0.0), 2.5);
      col = mix(groundBase, reflCol, fresG * 0.85 + 0.1);
    }
  } else {
    // Fond : atmosphère sombre avec poussière d'étoile distordue
    float grad = smoothstep(-0.3, 0.9, uv.y);
    col = mix(vec3(0.01, 0.015, 0.03), vec3(0.08, 0.04, 0.12), grad);

    // Étoiles / particules
    vec2 stUv = uv * 40.0;
    // Distorsion basée sur l'audio (extrait GLSL du brief)
    float bassI = 0.3 + uBass * 0.7;
    vec2 uvDistorted = stUv + vec2(
      sin(stUv.y * 0.8 + uTime + rd.x*5.0) * 0.4 * bassI,
      cos(stUv.x * 0.8 + uTime + rd.z*5.0) * 0.4 * bassI
    );
    vec2 id = floor(uvDistorted);
    vec2 f = fract(uvDistorted) - 0.5;
    float rnd = fract(sin(dot(id, vec2(12.9898, 78.233))) * 43758.5453);
    float star = smoothstep(0.45, 0.0, length(f)) * step(0.985, rnd);
    col += vec3(1.0, 0.8, 0.5) * star * (0.6 + uHigh);
  }

  // Vignette subtile
  float vig = 1.0 - dot(uv * 0.9, uv * 0.9);
  col *= smoothstep(0.0, 0.8, vig);

  // Tonemapping ACES-like
  col = col / (col + vec3(1.0));
  col = pow(col, vec3(0.85));

  gl_FragColor = vec4(col, 1.0);
}
`;
