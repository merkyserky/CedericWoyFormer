// retro dynamic audio synth using Web Audio API

class AudioSynthesizer {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.musicInterval = null;
    this.musicTick = 0;
    this.bpm = 110;
    this.masterGain = null;
    this.musicGain = null;
    this.sfxGain = null;
  }

  init() {
    if (this.ctx) return;
    
    // Create audio context
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    
    this.ctx = new AudioContextClass();
    
    // Master Gain
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime); // keep overall volume comfortable
    this.masterGain.connect(this.ctx.destination);
    
    // Music Gain
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.setValueAtTime(0.4, this.ctx.currentTime); // music slightly quieter
    this.musicGain.connect(this.masterGain);

    // SFX Gain
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.setValueAtTime(0.7, this.ctx.currentTime);
    this.sfxGain.connect(this.masterGain);
    
    // Generate white noise buffer for drums/SFX
    const bufferSize = this.ctx.sampleRate * 2; // 2 seconds
    this.noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    // Start background music
    this.startMusic();
  }

  // Synthesize drum hits using Web Audio API nodes
  playKickSynth(t) {
    if (!this.ctx || !this.enabled) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(30, t + 0.1);
    
    gain.gain.setValueAtTime(0.28, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    
    osc.connect(gain);
    gain.connect(this.musicGain);
    
    osc.start(t);
    osc.stop(t + 0.12);
  }

  playSnareSynth(t) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    
    // Noise component (snare crackle)
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 1000;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.15, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.musicGain);
    
    // Tone component (body of snare)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(80, t + 0.08);
    
    oscGain.gain.setValueAtTime(0.12, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    
    osc.connect(oscGain);
    oscGain.connect(this.musicGain);
    
    noiseSource.start(t);
    noiseSource.stop(t + 0.15);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playHiHatSynth(t) {
    if (!this.ctx || !this.enabled || !this.noiseBuffer) return;
    
    const noiseSource = this.ctx.createBufferSource();
    noiseSource.buffer = this.noiseBuffer;
    
    const noiseFilter = this.ctx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 7500;
    
    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.05, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    
    noiseSource.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(this.musicGain);
    
    noiseSource.start(t);
    noiseSource.stop(t + 0.04);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (this.ctx) {
      if (this.enabled) {
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        this.masterGain.gain.setValueAtTime(0.3, this.ctx.currentTime);
      } else {
        this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
      }
    }
    return this.enabled;
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended' && this.enabled) {
      this.ctx.resume();
    }
  }

  // SOUND EFFECTS
  playJump() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.15);
    
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playCoin() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    // Classic chiptune ding: quick two-tone arpeggio
    osc.frequency.setValueAtTime(987.77, t); // B5
    osc.frequency.setValueAtTime(1318.51, t + 0.08); // E6
    
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.setValueAtTime(0.2, t + 0.08);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.35);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.35);
  }

  playDash() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    
    // Create white noise for dash whoosh
    const bufferSize = this.ctx.sampleRate * 0.12; // 0.12s
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    const noiseNode = this.ctx.createBufferSource();
    noiseNode.buffer = buffer;
    
    // Filter noise to sound like a cyber dash
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1000, t);
    filter.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.12);
    
    noiseNode.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);
    
    noiseNode.start(t);
    noiseNode.stop(t + 0.12);
  }

  playHit() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.linearRampToValueAtTime(60, t + 0.25);
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(180, t);
    osc2.frequency.linearRampToValueAtTime(50, t + 0.25);
    
    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.25);
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.25);
    osc2.stop(t + 0.25);
  }

  playDeath() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.6);
    
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.linearRampToValueAtTime(0.2, t + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.6);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.6);
  }

  playWin() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6 (Arpeggio)
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t + index * 0.08);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.2, t + index * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.01, t + index * 0.08 + 0.35);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(t + index * 0.08);
      osc.stop(t + index * 0.08 + 0.35);
    });
  }

  playBossShoot() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.15);
    
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.15);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.15);
  }

  playBossHit() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(30, t + 0.3);
    
    osc2.type = 'square';
    osc2.frequency.setValueAtTime(180, t);
    osc2.frequency.linearRampToValueAtTime(40, t + 0.3);
    
    gain.gain.setValueAtTime(0.45, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.3);
    
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.3);
    osc2.stop(t + 0.3);
  }

  playLaserShoot() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(800, t);
    osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);
    
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.12);
  }

  playGunPickup() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const notes = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50]; // C4, E4, G4, C5, E5, G5, C6 (rising arpeggio)
    
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, t + index * 0.05);
      
      gain.gain.setValueAtTime(0, t);
      gain.gain.setValueAtTime(0.12, t + index * 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, t + index * 0.05 + 0.15);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      
      osc.start(t + index * 0.05);
      osc.stop(t + index * 0.05 + 0.15);
    });
  }

  playShieldHit() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(1200, t);
    osc.frequency.setValueAtTime(900, t + 0.04);
    
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    
    osc.connect(gain);
    gain.connect(this.sfxGain);
    
    osc.start(t);
    osc.stop(t + 0.1);
  }

  playShieldBreak() {
    if (!this.ctx || !this.enabled) return;
    this.resume();

    const t = this.ctx.currentTime;
    // 1. Noise blast
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 600;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.3, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noiseSource.start(t);
      noiseSource.stop(t + 0.4);
    }
    
    // 2. High-pitch falling glass tones
    const notes = [880.00, 1046.50, 1318.51, 1567.98];
    notes.forEach((freq, index) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);
      osc.frequency.exponentialRampToValueAtTime(freq / 3, t + 0.35);
      
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
      
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  }

  playTurretFire() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(400, t);
    osc.frequency.exponentialRampToValueAtTime(100, t + 0.18);
    gain.gain.setValueAtTime(0.15, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  playWalkerStep() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(80, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.08);
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.08);
  }

  playTeleport() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, t);
    osc.frequency.exponentialRampToValueAtTime(1200, t + 0.25);
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(1200, t);
    osc2.frequency.exponentialRampToValueAtTime(200, t + 0.25);
    gain.gain.setValueAtTime(0.2, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc2.start(t);
    osc.stop(t + 0.3);
    osc2.stop(t + 0.3);
  }

  playKeyCollect() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.07);
      gain.gain.setValueAtTime(0.18, t + i * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.2);
      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(t + i * 0.07);
      osc.stop(t + i * 0.07 + 0.2);
    });
  }

  playDoorOpen() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    if (this.noiseBuffer) {
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = this.noiseBuffer;
      const noiseFilter = this.ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.value = 800;
      const noiseGain = this.ctx.createGain();
      noiseGain.gain.setValueAtTime(0.15, t);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      noiseSource.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(this.sfxGain);
      noiseSource.start(t);
      noiseSource.stop(t + 0.3);
    }
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, t);
    osc.frequency.exponentialRampToValueAtTime(600, t + 0.2);
    gain.gain.setValueAtTime(0.1, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  playGravityFlip() {
    if (!this.ctx || !this.enabled) return;
    this.resume();
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(600, t);
    osc.frequency.linearRampToValueAtTime(200, t + 0.15);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  // BACKGROUND MUSIC
  startMusic(isBoss = false) {
    if (this.musicInterval) clearInterval(this.musicInterval);
    
    // Choose BPM
    const bpm = isBoss ? 142 : 110;
    const stepDuration = 60 / bpm / 2; // eighth notes
    
    // Bass chord progressions
    const normalBass = [
      130.81, 130.81, 130.81, 130.81, // C
      103.83, 103.83, 103.83, 103.83, // Ab
      87.31, 87.31, 87.31, 87.31,     // F
      98.00, 98.00, 98.00, 98.00      // G
    ];

    const bossBass = [
      130.81, 130.81, 155.56, 155.56, // C, C, Eb, Eb
      196.00, 196.00, 207.65, 207.65, // G, G, Ab, Ab
      174.61, 174.61, 196.00, 196.00, // F, F, G, G
      130.81, 130.81, 130.81, 130.81  // C, C, C, C
    ];

    const bassProgression = isBoss ? bossBass : normalBass;
    
    // Lead melody progressions
    const normalLead = [
      261.63, 0, 311.13, 392.00, 0, 311.13, 261.63, 0,
      207.65, 0, 261.63, 311.13, 0, 261.63, 207.65, 0,
      174.61, 0, 207.65, 261.63, 0, 207.65, 174.61, 0,
      196.00, 246.94, 293.66, 392.00, 0, 293.66, 246.94, 0
    ];

    const bossLead = [
      261.63, 311.13, 392.00, 523.25, 392.00, 311.13, 261.63, 0, // C4-Eb4-G4-C5-G4-Eb4-C4
      311.13, 392.00, 466.16, 622.25, 466.16, 392.00, 311.13, 0, // Eb4-G4-Bb4-Eb5-Bb4-G4-Eb4
      349.23, 415.30, 523.25, 698.46, 523.25, 415.30, 349.23, 0, // F4-Ab4-C5-F5-C5-Ab4-F4
      392.00, 493.88, 587.33, 783.99, 587.33, 493.88, 392.00, 783.99 // G4-B4-D5-G5-D5-B4-G4-G5
    ];

    const leadProgression = isBoss ? bossLead : normalLead;

    this.musicInterval = setInterval(() => {
      if (!this.enabled || !this.ctx) return;
      
      const t = this.ctx.currentTime;
      
      // Play drum beat if in boss fight
      if (isBoss) {
        const tickInPattern = this.musicTick % 8;
        if (tickInPattern === 0 || tickInPattern === 6) {
          this.playKickSynth(t);
        } else if (tickInPattern === 4) {
          this.playSnareSynth(t);
        } else if (tickInPattern % 2 === 1) {
          this.playHiHatSynth(t);
        }
      }

      // Play bass note (every quarter note - even ticks)
      if (this.musicTick % 2 === 0) {
        const bassIdx = Math.floor(this.musicTick / 2) % bassProgression.length;
        const bassFreq = bassProgression[bassIdx];
        
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Boss bass is a heavy chugging sawtooth for grit, normal is triangle
        osc.type = isBoss ? 'sawtooth' : 'triangle';
        osc.frequency.setValueAtTime(bassFreq / 2, t); // Sub-bass octave
        
        gain.gain.setValueAtTime(isBoss ? 0.14 : 0.22, t);
        gain.gain.exponentialRampToValueAtTime(0.01, t + stepDuration * 1.8);
        
        osc.connect(gain);
        gain.connect(this.musicGain);
        
        osc.start(t);
        osc.stop(t + stepDuration * 1.8);
      }
      
      // Play lead note (on steps)
      const leadIdx = this.musicTick % leadProgression.length;
      const leadFreq = leadProgression[leadIdx];
      
      if (leadFreq > 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        // Boss lead is triangle for retro synth feel, normal is sine
        osc.type = isBoss ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(leadFreq * (isBoss ? 1.5 : 2), t);
        
        gain.gain.setValueAtTime(isBoss ? 0.09 : 0.08, t);
        gain.gain.exponentialRampToValueAtTime(0.005, t + stepDuration * 1.2);
        
        osc.connect(gain);
        gain.connect(this.musicGain);
        
        osc.start(t);
        osc.stop(t + stepDuration * 1.2);
      }
      
      this.musicTick++;
    }, stepDuration * 1000);
  }

  stopMusic() {
    if (this.musicInterval) {
      clearInterval(this.musicInterval);
      this.musicInterval = null;
    }
  }
}

export const audio = new AudioSynthesizer();
