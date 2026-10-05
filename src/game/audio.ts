// Procedural Web Audio Engine for Tokyo Driving Game
// Zero external files, fully responsive, zero latency

export class SoundEngine {
  ctx: AudioContext | null = null;
  enabled: boolean = true;
  radioEnabled: boolean = false;
  isMuted: boolean = false;

  engineGain: GainNode | null = null;
  engineOsc1: OscillatorNode | null = null;
  engineOsc2: OscillatorNode | null = null;
  engineFilter: BiquadFilterNode | null = null;

  tireGain: GainNode | null = null;
  tireFilter: BiquadFilterNode | null = null;

  nitroGain: GainNode | null = null;
  hornOsc1: OscillatorNode | null = null;
  hornOsc2: OscillatorNode | null = null;
  hornGain: GainNode | null = null;

  radioInterval: any = null;
  radioGain: GainNode | null = null;
  masterGain: GainNode | null = null;

  lastGear: number = 1;
  lastThrottle: number = 0;

  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.radioEnabled = false;
    this.isMuted = false;

    this.engineGain = null;
    this.engineOsc1 = null;
    this.engineOsc2 = null;
    this.engineFilter = null;

    this.tireGain = null;
    this.tireFilter = null;

    this.nitroGain = null;
    this.hornOsc1 = null;
    this.hornOsc2 = null;
    this.hornGain = null;

    this.radioInterval = null;
    this.radioGain = null;

    this.lastGear = 1;
    this.lastThrottle = 0;
  }

  init() {
    if (this.ctx) return;
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioCtx();

      // Master Gain
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupEngine();
      this.setupTires();
      this.setupNitro();
      this.setupHorn();
      this.setupRadio();
    } catch (e) {
      console.warn('Web Audio not available:', e);
    }
  }

  ensureContext() {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  setupEngine() {
    if (!this.ctx) return;
    // Dual oscillator engine sound
    this.engineOsc1 = this.ctx.createOscillator();
    this.engineOsc2 = this.ctx.createOscillator();
    this.engineOsc1.type = 'sawtooth';
    this.engineOsc2.type = 'triangle';

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.08, this.ctx.currentTime);

    this.engineOsc1.connect(this.engineFilter);
    this.engineOsc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.engineOsc1.start();
    this.engineOsc2.start();
  }

  setupTires() {
    if (!this.ctx) return;
    // White noise for tire screech
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;
    whiteNoise.loop = true;

    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.setValueAtTime(950, this.ctx.currentTime);
    this.tireFilter.Q.setValueAtTime(5.0, this.ctx.currentTime);

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.setValueAtTime(0, this.ctx.currentTime);

    whiteNoise.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

    whiteNoise.start();
  }

  setupNitro() {
    if (!this.ctx) return;
    // Filtered noise for nitro hiss / blowtorch sound
    const bufferSize = this.ctx.sampleRate;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    const nitroNoise = this.ctx.createBufferSource();
    nitroNoise.buffer = noiseBuffer;
    nitroNoise.loop = true;

    const nitroFilter = this.ctx.createBiquadFilter();
    nitroFilter.type = 'highpass';
    nitroFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);

    this.nitroGain = this.ctx.createGain();
    this.nitroGain.gain.setValueAtTime(0, this.ctx.currentTime);

    nitroNoise.connect(nitroFilter);
    nitroFilter.connect(this.nitroGain);
    this.nitroGain.connect(this.masterGain);

    nitroNoise.start();
  }

  setupHorn() {
    if (!this.ctx) return;
    this.hornOsc1 = this.ctx.createOscillator();
    this.hornOsc2 = this.ctx.createOscillator();
    this.hornOsc1.type = 'sawtooth';
    this.hornOsc2.type = 'sawtooth';
    this.hornOsc1.frequency.setValueAtTime(420, this.ctx.currentTime); // Standard Japanese dual horn
    this.hornOsc2.frequency.setValueAtTime(510, this.ctx.currentTime);

    const hornFilter = this.ctx.createBiquadFilter();
    hornFilter.type = 'lowpass';
    hornFilter.frequency.setValueAtTime(2200, this.ctx.currentTime);

    this.hornGain = this.ctx.createGain();
    this.hornGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.hornOsc1.connect(hornFilter);
    this.hornOsc2.connect(hornFilter);
    hornFilter.connect(this.hornGain);
    this.hornGain.connect(this.masterGain);

    this.hornOsc1.start();
    this.hornOsc2.start();
  }

  setHorn(active) {
    if (!this.ctx || !this.hornGain) return;
    this.ensureContext();
    const t = this.ctx.currentTime;
    this.hornGain.gain.cancelScheduledValues(t);
    this.hornGain.gain.linearRampToValueAtTime(active ? 0.35 : 0, t + 0.05);
  }

  // Turbo blow-off flutter sound ("pssh-chi-chi")
  playTurboFlutter() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;

    const noiseBuffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.45, this.ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    const noise = this.ctx.createBufferSource();
    noise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(3200, now);
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.4);
    filter.Q.setValueAtTime(4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.42);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(now);
  }

  // Crash impact sound
  playCrash(intensity = 1.0) {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(30, now + 0.35);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(Math.min(0.6, 0.2 + intensity * 0.4), now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(now);
    osc.stop(now + 0.45);
  }

  // Ambient Tokyo Synthwave / Lo-Fi Radio generator
  setupRadio() {
    if (!this.ctx) return;
    this.radioGain = this.ctx.createGain();
    this.radioGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this.radioGain.connect(this.masterGain);

    // Chords progression for Tokyo night cruise (Fm7 - Eb - Dbmaj7 - C7)
    const chords = [
      [174.61, 207.65, 261.63, 311.13], // Fm7
      [155.56, 196.00, 233.08, 311.13], // Eb
      [138.59, 174.61, 207.65, 261.63], // Dbmaj7
      [130.81, 164.81, 196.00, 246.94], // C7
    ];
    let chordIdx = 0;

    const playChord = () => {
      if (!this.radioEnabled || !this.ctx || this.isMuted) return;
      const now = this.ctx.currentTime;
      const chord = chords[chordIdx % chords.length];
      chordIdx++;

      chord.forEach((freq) => {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.04, now);
        g.gain.linearRampToValueAtTime(0.06, now + 0.8);
        g.gain.exponentialRampToValueAtTime(0.001, now + 3.8);

        osc.connect(g);
        g.connect(this.radioGain);
        osc.start(now);
        osc.stop(now + 4.0);
      });
    };

    this.radioInterval = setInterval(playChord, 3800);
  }

  toggleRadio() {
    this.ensureContext();
    this.radioEnabled = !this.radioEnabled;
    if (this.radioGain) {
      const now = this.ctx.currentTime;
      this.radioGain.gain.linearRampToValueAtTime(this.radioEnabled ? 0.4 : 0, now + 0.5);
    }
    return this.radioEnabled;
  }

  toggleMute() {
    this.ensureContext();
    this.isMuted = !this.isMuted;
    if (this.masterGain) {
      this.masterGain.gain.setValueAtTime(this.isMuted ? 0 : 0.7, this.ctx.currentTime);
    }
    return !this.isMuted;
  }

  playBurnoutFanfare() {
    if (!this.ctx || this.isMuted) return;
    const now = this.ctx.currentTime;
    // Ascending power chime for Burnout Chain!
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.06);
      gain.gain.setValueAtTime(0.22, now + idx * 0.06);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.06 + 0.35);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + idx * 0.06);
      osc.stop(now + idx * 0.06 + 0.4);
    });
  }

  // Update loop called every frame with vehicle state
  update(carState: any) {
    if (!this.ctx || this.isMuted) return;
    const { rpm, speed, throttle, gear, driftFactor, isBoosting, vLat } = carState;

    const now = this.ctx.currentTime;

    // 1. Engine frequency and volume
    if (this.engineOsc1 && this.engineOsc2 && this.engineFilter && this.engineGain) {
      // Base frequency mapped from RPM
      const baseFreq = 42 + (rpm / 8500) * 160;
      this.engineOsc1.frequency.setTargetAtTime(baseFreq, now, 0.05);
      this.engineOsc2.frequency.setTargetAtTime(baseFreq * 0.5, now, 0.05);

      // Filter opens up with RPM and throttle
      const targetFilter = 320 + (rpm / 8500) * 1800 + throttle * 1200;
      this.engineFilter.frequency.setTargetAtTime(targetFilter, now, 0.05);

      // Volume increases under load
      const targetGain = 0.08 + Math.abs(throttle) * 0.14 + (rpm / 8500) * 0.08;
      this.engineGain.gain.setTargetAtTime(targetGain, now, 0.05);
    }

    // 2. Turbo flutter trigger on gear upshift or throttle drop
    if (gear > this.lastGear && throttle > 0.5) {
      this.playTurboFlutter();
    } else if (this.lastThrottle > 0.7 && throttle < 0.2 && rpm > 4500) {
      this.playTurboFlutter();
    }
    this.lastGear = gear;
    this.lastThrottle = throttle;

    // 3. Dynamic Tire screech audio proportional to lateral slip
    if (this.tireGain) {
      const slipSpeed = Math.abs(vLat || 0);
      const isScreeching = driftFactor > 0.1 || slipSpeed > 2.0;
      const targetScreech = isScreeching
        ? Math.min(0.55, 0.12 + (driftFactor * 0.28) + (slipSpeed / 12) * 0.22)
        : 0;
      this.tireGain.gain.setTargetAtTime(targetScreech, now, 0.05);
      if (this.tireFilter) {
        this.tireFilter.frequency.setTargetAtTime(820 + Math.min(1.0, driftFactor + slipSpeed / 10) * 600, now, 0.05);
      }
    }

    // 4. Nitro boost flame sound
    if (this.nitroGain) {
      const targetNitro = isBoosting ? 0.38 : 0;
      this.nitroGain.gain.setTargetAtTime(targetNitro, now, 0.06);
    }
  }

  destroy() {
    if (this.radioInterval) {
      clearInterval(this.radioInterval);
      this.radioInterval = null;
    }
    if (this.ctx) {
      try {
        this.ctx.close();
      } catch {}
      this.ctx = null;
    }
  }
}
