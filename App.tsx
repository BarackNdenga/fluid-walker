import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { vertexShader, fragmentShader } from "./shaders/raymarcher.glsl";
import { postVertex, postFragment } from "./shaders/postprocess.glsl";
import { useAudio } from "./hooks/useAudio";

const MAX_SHOCKS = 5;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const audio = useAudio();
  const [fps, setFps] = useState(0);
  const [gravityFlipped, setGravityFlipped] = useState(false);
  const gravityRef = useRef(0);

  // Gestion des shockwaves : tableau partagé avec le shader
  const shocksRef = useRef<
    { x: number; y: number; age: number; strength: number; active: boolean }[]
  >(
    Array.from({ length: MAX_SHOCKS }, () => ({ x: 0, y: 0, age: 2, strength: 0, active: false })),
  );

  // État souris normalisé -1..1
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // --- Renderer ---
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    const setSize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      rt.setSize(window.innerWidth * renderer.getPixelRatio(), window.innerHeight * renderer.getPixelRatio());
    };

    // --- Scène + caméra (pour les 2 quads fullscreen) ---
    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // --- Premier pass : raymarcher ---
    const rt = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
    });

    const raymarchMat = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(1, 1) },
        uMouse: { value: new THREE.Vector2(0, 0) },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uGravityFlip: { value: 0 },
        uStep: { value: 0 },
      },
    });
    const quad1 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), raymarchMat);
    const scene1 = new THREE.Scene();
    scene1.add(quad1);

    // --- Second pass : post-process ---
    const shockUniforms: THREE.IUniform[] = [];
    for (let i = 0; i < MAX_SHOCKS; i++) {
      shockUniforms.push({ value: new THREE.Vector4(0, 0, 2, 0) });
    }

    const postMat = new THREE.ShaderMaterial({
      vertexShader: postVertex,
      fragmentShader: postFragment,
      uniforms: {
        tDiffuse: { value: rt.texture },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uShock: { value: shockUniforms.map((u) => u.value) },
        uShockCount: { value: MAX_SHOCKS },
      },
    });
    const quad2 = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat);
    scene.add(quad2);

    setSize();
    window.addEventListener("resize", setSize);

    // --- Souris ---
    const onMove = (e: MouseEvent | TouchEvent) => {
      let x = 0, y = 0;
      if ("touches" in e && e.touches[0]) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else if ("clientX" in e) {
        x = e.clientX;
        y = e.clientY;
      }
      mouseRef.current.targetX = (x / window.innerWidth) * 2 - 1;
      mouseRef.current.targetY = -((y / window.innerHeight) * 2 - 1);
    };
    const onClick = (e: MouseEvent | TouchEvent) => {
      // Spawn d'une shockwave manuelle au clic
      let x = 0, y = 0;
      if ("touches" in e && e.touches[0]) {
        x = e.touches[0].clientX;
        y = e.touches[0].clientY;
      } else if ("clientX" in e) {
        x = e.clientX;
        y = e.clientY;
      }
      spawnShock(x / window.innerWidth, 1 - y / window.innerHeight, 1.2);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("click", onClick);
    window.addEventListener("touchstart", onClick);

    // --- Boucle de rendu ---
    const clock = new THREE.Clock();
    let lastShockStep = 0;
    let frames = 0;
    let fpsTime = 0;
    let rafId = 0;

    const spawnShock = (nx: number, ny: number, strength: number) => {
      // Recycle le plus vieux slot
      let slot = 0;
      let oldest = -1;
      for (let i = 0; i < MAX_SHOCKS; i++) {
        if (shocksRef.current[i].age > oldest) {
          oldest = shocksRef.current[i].age;
          slot = i;
        }
      }
      shocksRef.current[slot] = { x: nx, y: ny, age: 0, strength, active: true };
    };

    const animate = () => {
      const dt = Math.min(clock.getDelta(), 0.05);
      const t = clock.getElapsedTime();

      // FPS
      frames++;
      fpsTime += dt;
      if (fpsTime >= 0.5) {
        setFps(Math.round(frames / fpsTime));
        frames = 0;
        fpsTime = 0;
      }

      // Audio data
      const ad = audio.analyser.current;
      const stepVal = audio.stepRef.current;
      audio.stepRef.current = Math.max(0, stepVal - dt * 3);

      // Détecte un "pas" via kick audio OU via l'oscillation de marche (~2Hz)
      const walkPhase = Math.sin(t * 1.4 * 2); // deux pas par cycle
      const stepTriggered = ad.kick || (walkPhase > 0.95 && t - lastShockStep > 0.35);
      if (stepTriggered && t - lastShockStep > 0.15) {
        lastShockStep = t;
        // Shockwave au centre (silhouette) — légèrement bruitée
        spawnShock(0.5 + (Math.random() - 0.5) * 0.05, 0.55, 0.8 + ad.bass * 0.5);
      }

      // Gravité smooth
      gravityRef.current += ((gravityFlipped ? 1 : 0) - gravityRef.current) * dt * 4;

      // Souris smooth
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * Math.min(1, dt * 6);
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * Math.min(1, dt * 6);

      // Âge des shockwaves
      for (let i = 0; i < MAX_SHOCKS; i++) {
        const s = shocksRef.current[i];
        if (s.active) {
          s.age += dt * 1.2;
          if (s.age > 1.5) s.active = false;
          shockUniforms[i].value.set(s.x, s.y, s.age, s.strength);
        } else {
          shockUniforms[i].value.set(0, 0, 2, 0);
        }
      }

      // --- Pass 1 : raymarcher → renderTarget ---
      raymarchMat.uniforms.uTime.value = t;
      raymarchMat.uniforms.uResolution.value.set(
        window.innerWidth * renderer.getPixelRatio(),
        window.innerHeight * renderer.getPixelRatio(),
      );
      raymarchMat.uniforms.uMouse.value.set(mouseRef.current.x, mouseRef.current.y);
      raymarchMat.uniforms.uBass.value = ad.bass;
      raymarchMat.uniforms.uMid.value = ad.mid;
      raymarchMat.uniforms.uHigh.value = ad.high;
      raymarchMat.uniforms.uGravityFlip.value = gravityRef.current;
      raymarchMat.uniforms.uStep.value = stepVal;
      renderer.setRenderTarget(rt);
      renderer.render(scene1, camera);

      // --- Pass 2 : post-process → écran ---
      postMat.uniforms.uTime.value = t;
      postMat.uniforms.uBass.value = ad.bass;
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);

      rafId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", setSize);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("click", onClick);
      window.removeEventListener("touchstart", onClick);
      rt.dispose();
      raymarchMat.dispose();
      postMat.dispose();
      renderer.dispose();
    };
  }, [audio, gravityFlipped]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) audio.setSource("file", file);
  };

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />

      {/* UI Overlay */}
      <div className="absolute inset-0 pointer-events-none select-none">
        {/* Titre */}
        <div className="absolute top-4 left-4 text-white/80 font-mono">
          <div className="text-xs tracking-[0.3em] text-orange-400/80">SDF · RAYMARCHING</div>
          <div className="text-xl font-bold mt-1">LIQUID WALKER</div>
          <div className="text-[10px] text-white/40 mt-0.5">
            Signed Distance Function · Perlin 4D · WebGL
          </div>
        </div>

        {/* FPS */}
        <div className="absolute top-4 right-4 text-white/50 font-mono text-xs text-right">
          <div>{fps} fps</div>
          <div className="text-orange-400/70">
            bass {(audio.analyser.current.bass * 100).toFixed(0)}%
          </div>
        </div>

        {/* Instructions */}
        <div className="absolute bottom-4 left-4 text-white/60 font-mono text-[11px] leading-relaxed max-w-xs">
          <div className="text-orange-400/80 mb-1">→ INTERACTIONS</div>
          <div>• souris : torsion + teinte</div>
          <div>• clic : onde de choc manuelle</div>
          <div>• kicks audio : éclaboussures</div>
          <div>• bouton ⬇ : inverse la gravité</div>
        </div>

        {/* Contrôles audio */}
        <div className="absolute bottom-4 right-4 flex flex-col items-end gap-2 pointer-events-auto">
          {!audio.started ? (
            <button
              onClick={audio.start}
              className="px-6 py-3 bg-orange-500/90 hover:bg-orange-400 text-black font-bold font-mono tracking-wider text-sm rounded backdrop-blur transition-all hover:scale-105 shadow-lg shadow-orange-500/40"
            >
              ▶ DÉMARRER L'EXPÉRIENCE
            </button>
          ) : (
            <>
              <div className="flex gap-1 bg-white/5 backdrop-blur border border-white/10 rounded p-1">
                <button
                  onClick={() => audio.setSource("procedural")}
                  className={`px-3 py-1.5 font-mono text-[11px] rounded transition-all ${
                    audio.source === "procedural"
                      ? "bg-orange-500 text-black font-bold"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  120 BPM
                </button>
                <button
                  onClick={() => audio.setSource("mic")}
                  className={`px-3 py-1.5 font-mono text-[11px] rounded transition-all ${
                    audio.source === "mic"
                      ? "bg-orange-500 text-black font-bold"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  🎤 MIC
                </button>
                <label
                  className={`px-3 py-1.5 font-mono text-[11px] rounded transition-all cursor-pointer ${
                    audio.source === "file"
                      ? "bg-orange-500 text-black font-bold"
                      : "text-white/60 hover:text-white"
                  }`}
                >
                  📁 MP3
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={handleFile}
                  />
                </label>
              </div>
              <button
                onClick={() => setGravityFlipped((g) => !g)}
                className={`px-4 py-2 font-mono text-[11px] rounded border backdrop-blur transition-all ${
                  gravityFlipped
                    ? "bg-purple-500/30 border-purple-400 text-purple-200"
                    : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                }`}
              >
                {gravityFlipped ? "↓ GRAVITÉ NORMALE" : "↑ INVERSER GRAVITÉ"}
              </button>
            </>
          )}
        </div>

        {/* Barre de bass visuelle */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all"
            style={{ width: `${audio.analyser.current.bass * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
