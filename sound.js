/* Small PC-speaker-style synthesizer. Audio starts only after a player gesture. */
(function (root) {
  'use strict';
  const EFFECTS = {
    throw: [[440, 880, .09], [660, 220, .13]],
    building: [[170, 45, .12], [95, 30, .15], [60, 20, .13]],
    gorilla: [[240, 80, .12], [180, 40, .16], [100, 25, .22]],
    miss: [[220, 110, .12], [110, 55, .15]],
    round: [[262, 262, .09], [330, 330, .09], [392, 392, .09], [523, 523, .22]],
    match: [[262, 262, .10], [330, 330, .10], [392, 392, .10], [523, 523, .15], [392, 392, .10], [659, 659, .28]],
    // PC-speaker melodies that last for the whole 2.4 second dance.
    cheer: [[262, 262, .16], [330, 330, .16], [392, 392, .16], [330, 330, .16], [294, 294, .16], [349, 349, .16], [440, 440, .16], [349, 349, .16], [262, 262, .16], [330, 330, .16], [392, 392, .16], [523, 523, .16], [392, 392, .16], [523, 523, .16]],
    champion: [[330, 330, .16], [392, 392, .16], [523, 523, .16], [659, 659, .16], [523, 523, .16], [659, 659, .16], [784, 784, .16], [659, 659, .16], [523, 523, .16], [784, 784, .16], [1047, 1047, .16], [784, 784, .16], [1047, 1047, .16], [1047, 1047, .16]]
  };
  class Sound {
    constructor(createContext = () => new (root.AudioContext || root.webkitAudioContext)()) {
      this.createContext = createContext; this.context = null;
      this.enabled = true; this.available = true; this.voices = new Set();
    }
    unlock() {
      if (!this.enabled || !this.available) return;
      try {
        if (!this.context) this.context = this.createContext();
        if (this.context.state === 'suspended') {
          // A rejected audio permission must never interrupt the game.
          this.context.resume().catch(() => { this.available = false; this.stop(); });
        }
      } catch { this.available = false; }
    }
    setEnabled(enabled) {
      this.enabled = enabled;
      if (!enabled) this.stop();
      else this.unlock();
    }
    stop() {
      for (const voice of this.voices) { try { voice.stop(); } catch { /* Already ended. */ } }
      this.voices.clear();
    }
    play(effect) {
      if (!this.enabled || !EFFECTS[effect]) return;
      this.unlock();
      if (!this.available || !this.context) return;
      const context = this.context;
      let time = context.currentTime + .01;
      for (const [startHz, endHz, duration] of EFFECTS[effect]) {
        const voice = context.createOscillator(), gain = context.createGain();
        voice.type = 'square'; voice.frequency.setValueAtTime(startHz, time);
        voice.frequency.exponentialRampToValueAtTime(endHz, time + duration);
        gain.gain.setValueAtTime(0, time);
        gain.gain.linearRampToValueAtTime(.055, time + .006);
        gain.gain.exponentialRampToValueAtTime(.001, time + duration);
        gain.gain.setValueAtTime(0, time + duration + .005);
        voice.connect(gain); gain.connect(context.destination);
        this.voices.add(voice);
        voice.onended = () => { voice.disconnect(); gain.disconnect(); this.voices.delete(voice); };
        voice.start(time); voice.stop(time + duration + .01);
        time += duration + .015;
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Sound };
  else root.GorillaSound = Sound;
})(typeof globalThis !== 'undefined' ? globalThis : this);
