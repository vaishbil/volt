/**
 * Generative Ambient Synthesizer using HTML5 Web Audio API
 * Fully offline-capable, responsive, and zero-bandwidth.
 */

let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let activeNodes: {
  sources: AudioNode[];
  timers: any[];
} = { sources: [], timers: [] };

let currentTrackId: string | null = null;
let isPlaying = false;
let currentVolume = 0.5;

function initAudio() {
  if (!audioCtx) {
    // Standard audio context initialization
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
    masterGain = audioCtx.createGain();
    masterGain.gain.setValueAtTime(currentVolume, audioCtx.currentTime);
    masterGain.connect(audioCtx.destination);
  }
  // Resume if suspended (browser autoplay policy)
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

// Noise buffer generation helper
function createNoiseBuffer(type: "white" | "pink" | "brown", duration = 4.0): AudioBuffer {
  if (!audioCtx) throw new Error("AudioContext not initialized");
  const bufferSize = audioCtx.sampleRate * duration;
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);

  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0; // for pink
  let lastOut = 0.0; // for brown

  for (let i = 0; i < bufferSize; i++) {
    const white = Math.random() * 2 - 1;
    if (type === "white") {
      data[i] = white;
    } else if (type === "pink") {
      // Kellet's refined pink noise approximation
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      data[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      data[i] *= 0.11; // Gain normalization
      b6 = white * 0.115926;
    } else if (type === "brown") {
      data[i] = (lastOut + 0.02 * white) / 1.02;
      lastOut = data[i];
      data[i] *= 3.5; // Gain normalization
    }
  }

  return buffer;
}

let htmlAudio: HTMLAudioElement | null = null;

export function stopAmbient() {
  isPlaying = false;
  
  if (htmlAudio) {
    htmlAudio.pause();
    htmlAudio.removeAttribute('src');
    htmlAudio.load();
    htmlAudio = null;
  }
  
  // Stop and disconnect all active nodes
  activeNodes.sources.forEach(node => {
    try {
      if ((node as any).stop) {
        (node as any).stop();
      }
      node.disconnect();
    } catch (e) {
      // Already stopped
    }
  });
  activeNodes.sources = [];

  // Clear any active timers
  activeNodes.timers.forEach(timer => clearInterval(timer));
  activeNodes.timers = [];

  currentTrackId = null;
}

export function startAmbient(trackId: string, url?: string): boolean {
  try {
    initAudio();
    if (!audioCtx || !masterGain) return false;

    // Stop existing sound first
    stopAmbient();

    currentTrackId = trackId;
    isPlaying = true;

    if (url) {
      htmlAudio = new Audio(url);
      htmlAudio.loop = true;
      htmlAudio.crossOrigin = "anonymous";
      
      const source = audioCtx.createMediaElementSource(htmlAudio);
      source.connect(masterGain);
      
      htmlAudio.play().catch(e => console.error("Audio play failed:", e));
      activeNodes.sources.push(source as unknown as AudioNode);
      return true;
    }

    if (trackId === "rain") {
      // --- Generative Rain Sound ---
      // 1. Pink Noise Source for rain texture
      const buffer = createNoiseBuffer("pink", 4.0);
      const rainSource = audioCtx.createBufferSource();
      rainSource.buffer = buffer;
      rainSource.loop = true;

      // 2. High-cut Filter (Lowpass) to make it smooth
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(1100, audioCtx.currentTime);

      // 3. Low-cut Filter (Highpass) to avoid muddy sub-frequencies
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.setValueAtTime(80, audioCtx.currentTime);

      // 4. Slow Wind / Gust Modulator (LFO)
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.setValueAtTime(0.08, audioCtx.currentTime); // very slow, 12.5s cycle

      const lfoGain = audioCtx.createGain();
      lfoGain.gain.setValueAtTime(0.15, audioCtx.currentTime); // modulate volume slightly

      const windGain = audioCtx.createGain();
      windGain.gain.setValueAtTime(0.8, audioCtx.currentTime);

      // Connections:
      // LFO -> LFOGain -> WindGain.gain (Modulates rain volume)
      lfo.connect(lfoGain);
      lfoGain.connect(windGain.gain);

      // rain -> lowpass -> highpass -> windGain -> master
      rainSource.connect(lowpass);
      lowpass.connect(highpass);
      highpass.connect(windGain);
      windGain.connect(masterGain);

      // Start nodes
      rainSource.start(0);
      lfo.start(0);

      // Keep references
      activeNodes.sources.push(rainSource, lfo, lowpass, highpass, windGain);

    } else if (trackId === "campfire") {
      // --- Generative Cozy Campfire Crackle ---
      // 1. Low rumble base (Brown Noise + lowpass)
      const rumbleBuffer = createNoiseBuffer("brown", 3.0);
      const rumbleSource = audioCtx.createBufferSource();
      rumbleSource.buffer = rumbleBuffer;
      rumbleSource.loop = true;

      const rumbleFilter = audioCtx.createBiquadFilter();
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.setValueAtTime(140, audioCtx.currentTime);

      const rumbleGain = audioCtx.createGain();
      rumbleGain.gain.setValueAtTime(0.65, audioCtx.currentTime);

      rumbleSource.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(masterGain);
      rumbleSource.start(0);

      activeNodes.sources.push(rumbleSource, rumbleFilter, rumbleGain);

      // 2. High crackle snap generator (timer-based)
      const triggerCrackle = () => {
        if (!audioCtx || !masterGain || !isPlaying) return;

        // Generate tiny snap
        const osc = audioCtx.createOscillator();
        const crackleFilter = audioCtx.createBiquadFilter();
        const amp = audioCtx.createGain();

        // High frequency bandpass for snap
        crackleFilter.type = "bandpass";
        crackleFilter.frequency.setValueAtTime(2400 + Math.random() * 3000, audioCtx.currentTime);
        crackleFilter.Q.setValueAtTime(6.0, audioCtx.currentTime);

        // Snap pitch envelope (very high to low quickly)
        osc.type = "triangle";
        osc.frequency.setValueAtTime(800 + Math.random() * 1500, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(80, audioCtx.currentTime + 0.015);

        // Extremely fast decay envelope
        amp.gain.setValueAtTime(0.08 + Math.random() * 0.15, audioCtx.currentTime);
        amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.01 + Math.random() * 0.02);

        osc.connect(crackleFilter);
        crackleFilter.connect(amp);
        amp.connect(masterGain);

        osc.start(0);
        osc.stop(audioCtx.currentTime + 0.04);
      };

      // Periodic trigger: every 90ms check for random snaps
      const timerId = setInterval(() => {
        if (Math.random() < 0.4) {
          triggerCrackle();
        }
        if (Math.random() < 0.08) {
          // Bigger wooden snap
          triggerCrackle();
          setTimeout(triggerCrackle, 40 + Math.random() * 50);
        }
      }, 95);

      activeNodes.timers.push(timerId);

    } else if (trackId === "stream") {
      // --- Generative Forest Stream ---
      // 1. Water flowing continuous base (Pink Noise)
      const baseBuffer = createNoiseBuffer("pink", 4.0);
      const baseSource = audioCtx.createBufferSource();
      baseSource.buffer = baseBuffer;
      baseSource.loop = true;

      const baseFilter = audioCtx.createBiquadFilter();
      baseFilter.type = "bandpass";
      baseFilter.frequency.setValueAtTime(650, audioCtx.currentTime);
      baseFilter.Q.setValueAtTime(2.0, audioCtx.currentTime);

      const baseGain = audioCtx.createGain();
      baseGain.gain.setValueAtTime(0.35, audioCtx.currentTime);

      // Slow flow modulator
      const flowLfo = audioCtx.createOscillator();
      flowLfo.type = "sine";
      flowLfo.frequency.setValueAtTime(0.12, audioCtx.currentTime); // 8 second wave

      const flowLfoGain = audioCtx.createGain();
      flowLfoGain.gain.setValueAtTime(150, audioCtx.currentTime); // modulate filter cutoff

      flowLfo.connect(flowLfoGain);
      flowLfoGain.connect(baseFilter.frequency); // Modulate cut-off dynamically!

      baseSource.connect(baseFilter);
      baseFilter.connect(baseGain);
      baseGain.connect(masterGain);

      baseSource.start(0);
      flowLfo.start(0);

      activeNodes.sources.push(baseSource, baseFilter, baseGain, flowLfo, flowLfoGain);

      // 2. Bubbles/splashes generator (sinusoids with rapid pitch sweep)
      const triggerBubble = () => {
        if (!audioCtx || !masterGain || !isPlaying) return;

        const osc = audioCtx.createOscillator();
        const amp = audioCtx.createGain();

        osc.type = "sine";
        // Water bubbles slide rapidly upward in pitch
        const startFreq = 700 + Math.random() * 800;
        osc.frequency.setValueAtTime(startFreq, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(startFreq * (1.5 + Math.random() * 0.4), audioCtx.currentTime + 0.08);

        // Gentle envelope
        amp.gain.setValueAtTime(0.001, audioCtx.currentTime);
        amp.gain.linearRampToValueAtTime(0.04 + Math.random() * 0.05, audioCtx.currentTime + 0.02);
        amp.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.07 + Math.random() * 0.05);

        osc.connect(amp);
        amp.connect(masterGain);

        osc.start(0);
        osc.stop(audioCtx.currentTime + 0.15);
      };

      const timerId = setInterval(() => {
        if (Math.random() < 0.55) {
          triggerBubble();
        }
      }, 140);

      activeNodes.timers.push(timerId);

    } else if (trackId === "drone") {
      // --- Deep Cosmos Space Pad Drone ---
      // Harmonic complex of 4 detuned triangle waves
      const freqs = [105, 157.5, 210, 315]; // Root (A2), Fifth (E3), Octave (A3), Octave+Fifth (E4)
      const gains = [0.4, 0.35, 0.25, 0.15];

      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = "lowpass";
      lowpass.frequency.setValueAtTime(240, audioCtx.currentTime);
      lowpass.Q.setValueAtTime(3.5, audioCtx.currentTime);

      // Filters filter sweeps
      const filterLfo = audioCtx.createOscillator();
      filterLfo.type = "sine";
      filterLfo.frequency.setValueAtTime(0.06, audioCtx.currentTime); // 16.6s sweep

      const filterLfoGain = audioCtx.createGain();
      filterLfoGain.gain.setValueAtTime(100, audioCtx.currentTime); // sweep range +/- 100Hz

      filterLfo.connect(filterLfoGain);
      filterLfoGain.connect(lowpass.frequency);
      filterLfo.start(0);

      activeNodes.sources.push(filterLfo, filterLfoGain, lowpass);

      freqs.forEach((freq, idx) => {
        if (!audioCtx) return;
        const osc = audioCtx.createOscillator();
        const oscGain = audioCtx.createGain();

        // Add detune / chorusing
        osc.type = "triangle";
        osc.frequency.setValueAtTime(freq + (Math.random() * 0.4 - 0.2), audioCtx.currentTime);

        // Modulate fine pitch very slowly
        const drift = audioCtx.createOscillator();
        drift.type = "sine";
        drift.frequency.setValueAtTime(0.1 + Math.random() * 0.15, audioCtx.currentTime);
        const driftGain = audioCtx.createGain();
        driftGain.gain.setValueAtTime(0.3 + Math.random() * 0.4, audioCtx.currentTime);

        drift.connect(driftGain);
        driftGain.connect(osc.frequency);

        oscGain.gain.setValueAtTime(gains[idx], audioCtx.currentTime);

        osc.connect(oscGain);
        oscGain.connect(lowpass);

        osc.start(0);
        drift.start(0);

        activeNodes.sources.push(osc, oscGain, drift, driftGain);
      });

      lowpass.connect(masterGain);
    }

    return true;
  } catch (error) {
    console.error("Failed to start ambient audio:", error);
    isPlaying = false;
    currentTrackId = null;
    return false;
  }
}

export function setAmbientVolume(vol: number) {
  currentVolume = Math.max(0, Math.min(1, vol));
  if (masterGain && audioCtx) {
    masterGain.gain.linearRampToValueAtTime(currentVolume, audioCtx.currentTime + 0.1);
  }
}

export function getAmbientState() {
  return {
    isPlaying,
    currentTrackId,
    volume: currentVolume
  };
}
