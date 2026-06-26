# fluid-walker
A liquid mercury being emerges from code. Real‑time shader art built with Three.js, GLSL, and signed distance functions. No 3D models, no mocap – just math dancing to sound.


![Fluid Walker Demo](link-to-your-gif-or-video.gif)

---

## ✨ The Vibe

A human silhouette made of swirling metallic liquid emerges from a mirror-like floor. Every step sends a shockwave through the screen, every bass kick makes its head explode into a crown of stardust. It's an infinite loop of digital hypnosis – equal parts art installation and GPU stress test.

Built during a sleepless night where math became poetry and my graphics card almost caught fire.

---

## 🧠 Concept

- **SDF Character**: The walker is entirely defined by Signed Distance Functions in a custom GLSL shader. No polygons, no vertices – just real-time ray marching.
- **4D Perlin Noise Surface**: The skin is a living plasma, texturized with 4D noise (time is the 4th dimension) so it never repeats.
- **Audio Reactive**: Web Audio API captures frequency data; low frequencies trigger fluid splash on the head, high frequencies add chromatic aberration on the edges.
- **Post-Processing**: Custom ShaderPass adds bloom and selective chromatic aberration around shockwaves.

---

## 🛠️ Tech Stack

| Layer | Tech |
|----------------|----------------------------------------------------------------------|
| 3D Engine | [Three.js](https://threejs.org/) |
| Shaders | Custom GLSL (ray marching, SDF, Perlin noise) |
| Audio | Web Audio API + real-time frequency analysis |
| Post-Processing| EffectComposer, UnrealBloomPass, custom ShaderPass |
| Initial Concept| Generated with **Arena IA** & **Qwen Max** (AI-assisted visual seed) |
| Bundler | Vite (or Webpack, your choice) |
| Version Control| Git + GitHub |

---

## 🚀 Getting Started

### Prerequisites
- Node.js >= 18
- A modern browser with WebGL 2.0 support
- A decent GPU (mine survived, but it got warm)

### Installation

```bash
git clone https://github.com/yourusername/fluid-walker.git
cd fluid-walker
npm install
npm run dev


🎨 Credits & Inspirations

· Soundtrack inspiration: Experience by Ludovico Einaudi (remixed spatially).
· Creative coding heroes: The demoscene, Inigo Quilez's SDF articles, and every dev who ever said "what if this math could breathe?"
· Code & Shader Wizardry...


🖼️ Screenshots

Still Frame Action
link-to-still-1.png link-to-still-2.png


⚠️ Performance Notes

· Runs at 60fps on a RTX 3060 or equivalent. On integrated graphics... let's say you'll have a nice slideshow.
· You can lower the ray marching steps in config.js if your GPU starts crying.
· Yes, my laptop fan became a jet engine during development. Worth it.

Crafted with late nights, hot shaders, and the belief that code is the most beautiful form of magic.
