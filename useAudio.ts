import { useEffect, useRef, useState, useCallback } from "react";

export type AudioData = {
  bass: number;
  mid: number;
  high: number;
  kick: boolean; // pic de basse détecté ce frame
};

type UseAudioReturn = {
  analyser: React.MutableRefObject<AudioData>;
  start: () => Promise<void>;
  setSource: (mode: "procedural" | "mic" | "file", file?: File) => Promise<void>;
  source: "procedural" | "mic" | "file";
  started: boolean;
  stepRef: React.MutableRefObject<number>; // 1 quand un pas est détecté, décroit
};

export function useAudio(): UseAudioReturn {
  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array | null>(null);
  const dataRef = useRef<AudioData>({ bass: 0, mid: 0, high: 0, kick: false });
  const stepRef = useRef(0);
  const prevBassRef = useRef(0);
  const [source, setSourceState] = useState<"procedural" | "mic" | "file">("procedural");
  const [started, setStarted] = useState(false);
  const procStopRef = useRef<(() => void) | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const initCtx = useCallback(async () => {
    if (!ctxRef.current) {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      ctxRef.current = new Ctx();
      const analyser = ctxRef.current.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.75;
      analyserRef.current = analyser;
      dataArrayRef.current = new Uint8Array(analyser.frequencyBinCount);
    }
    if (ctxRef.current.state === "suspended") {
      await ctxRef.current.resume();
    }
  }, []);

  const stopProc = () => {
    if (procStopRef.current) {
      procStopRef.current();
      procStopRef.current = null;
    }
  };

  const stopMic = () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
  };

  // Boucle d'analyse : extrait bass/mid/high + détecte kicks
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (analyserRef.current && dataArrayRef.current) {
        // Cast pour compatibilité TS strict (Uint8Array<ArrayBuffer> vs ArrayBufferLike)
        (analyserRef.current as any).getByteFrequencyData(dataArrayRef.current);
        const d = dataArrayRef.current;
        const n = d.length;
        let bass = 0, mid = 0, high = 0;
        const bassEnd = Math.floor(n * 0.08);
        const midEnd = Math.floor(n * 0.35);
        for (let i = 0; i < bassEnd; i++) bass += d[i];
        for (let i = bassEnd; i < midEnd; i++) mid += d[i];
        for (let i = midEnd; i < n; i++) high += d[i];
        bass /= bassEnd * 255;
        mid /= (midEnd - bassEnd) * 255;
        high /= (n - midEnd) * 255;

        // Détection de kick : front montant rapide sur les basses
        const kick = bass > 0.55 && bass - prevBassRef.current > 0.12;
        prevBassRef.current = bass;
        if (kick) stepRef.current = 1.0;

        dataRef.current = { bass, mid, high, kick };
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Génération procédurale : kick + basse + hihat à 120 BPM
  const startProcedural = useCallback(async () => {
    await initCtx();
    const ctx = ctxRef.current!;
    const analyser = analyserRef.current!;
    const master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(analyser);
    analyser.connect(ctx.destination);

    const bpm = 120;
    const beat = 60 / bpm;
    let nextTime = ctx.currentTime + 0.05;
    let step = 0;
    let stopped = false;

    const playKick = (t: number) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.frequency.setValueAtTime(140, t);
      osc.frequency.exponentialRampToValueAtTime(40, t + 0.15);
      g.gain.setValueAtTime(1.2, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      osc.connect(g).connect(master);
      osc.start(t);
      osc.stop(t + 0.4);
    };

    const playHat = (t: number, accent = 1) => {
      const bufferSize = ctx.sampleRate * 0.05;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 7000;
      const g = ctx.createGain();
      g.gain.value = 0.18 * accent;
      src.connect(hp).connect(g).connect(master);
      src.start(t);
    };

    const playSnare = (t: number) => {
      const bufferSize = ctx.sampleRate * 0.2;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = 1800;
      const g = ctx.createGain();
      g.gain.value = 0.4;
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
    };

    const playBass = (t: number, freq: number) => {
      const osc = ctx.createOscillator();
      osc.type = "sawtooth";
      osc.frequency.value = freq;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 300;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beat * 1.8);
      osc.connect(lp).connect(g).connect(master);
      osc.start(t);
      osc.stop(t + beat * 2);
    };

    const bassNotes = [55, 55, 73.4, 82.4]; // A1, A1, D2, E2

    const schedule = () => {
      if (stopped) return;
      while (nextTime < ctx.currentTime + 0.2) {
        const s = step % 16;
        // Kick sur 0, 4, 8, 12
        if (s % 4 === 0) playKick(nextTime);
        // Snare sur 4, 12
        if (s === 4 || s === 12) playSnare(nextTime);
        // Hihat sur tous les pas, accent sur les pairs
        playHat(nextTime, s % 2 === 0 ? 1 : 0.5);
        // Basse sur 0, 8
        if (s === 0 || s === 8) playBass(nextTime, bassNotes[Math.floor(s / 4)]);
        nextTime += beat / 4;
        step++;
      }
    };

    const id = setInterval(schedule, 50);
    schedule();

    procStopRef.current = () => {
      stopped = true;
      clearInterval(id);
      master.disconnect();
    };
  }, [initCtx]);

  const start = useCallback(async () => {
    await startProcedural();
    setStarted(true);
  }, [startProcedural]);

  const setSource = useCallback(async (mode: "procedural" | "mic" | "file", file?: File) => {
    await initCtx();
    stopProc();
    stopMic();
    setSourceState(mode);

    if (mode === "procedural") {
      await startProcedural();
    } else if (mode === "mic") {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const src = ctxRef.current!.createMediaStreamSource(stream);
      src.connect(analyserRef.current!);
    } else if (mode === "file" && file) {
      const arrayBuf = await file.arrayBuffer();
      const audioBuf = await ctxRef.current!.decodeAudioData(arrayBuf);
      const src = ctxRef.current!.createBufferSource();
      src.buffer = audioBuf;
      src.loop = true;
      src.connect(analyserRef.current!);
      analyserRef.current!.connect(ctxRef.current!.destination);
      src.start();
    }
  }, [initCtx, startProcedural]);

  return { analyser: dataRef, start, setSource, source, started, stepRef };
}
