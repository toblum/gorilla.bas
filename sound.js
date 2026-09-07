/* Small PC-speaker-style synthesizer. Audio starts only after a player gesture. */
(function (root) {
  'use strict';
  const EFFECTS = {
    throw: [[440, 880, .09], [660, 220, .13]],
    // Explosions get a short sub-bass thump, a cracking transient and a dusty tail.
    building: [[112, 30, .18], [340, 78, .075], [82, 23, .22], [50, 16, .3]],
    gorilla: [[165, 38, .19], [460, 102, .085], [110, 25, .25], [62, 16, .36]],
    miss: [[220, 110, .12], [110, 55, .15]],
    round: [[262, 262, .09], [330, 330, .09], [392, 392, .09], [523, 523, .22]],
    match: [[262, 262, .10], [330, 330, .10], [392, 392, .10], [523, 523, .15], [392, 392, .10], [659, 659, .28]],
    // PC-speaker melodies that last for the whole 2.4 second dance.
    cheer: [[262, 262, .16], [330, 330, .16], [392, 392, .16], [330, 330, .16], [294, 294, .16], [349, 349, .16], [440, 440, .16], [349, 349, .16], [262, 262, .16], [330, 330, .16], [392, 392, .16], [523, 523, .16], [392, 392, .16], [523, 523, .16]],
    champion: [[330, 330, .16], [392, 392, .16], [523, 523, .16], [659, 659, .16], [523, 523, .16], [659, 659, .16], [784, 784, .16], [659, 659, .16], [523, 523, .16], [784, 784, .16], [1047, 1047, .16], [784, 784, .16], [1047, 1047, .16], [1047, 1047, .16]]
  };
  // Four melodic phrases, then a held tonic: a complete twenty-second ending.
  EFFECTS.finale = [
    [523,659,784,1047,988,784,659,784,880,784,659,587,659,784,1047,784],
    [698,880,1047,1175,1047,880,698,880,784,659,523,659,587,659,784,988],
    [523,659,784,1047,1319,1175,1047,784,880,1047,1175,1047,880,784,659,784],
    [698,880,1047,880,784,988,1175,988,1047,784,659,784,1047,1319,1568,1319]
  ].flat().map(hz => [hz, hz, .285]).concat([[1047, 1047, .785]]);
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
    play(effect, offset = 0) {
      if (!this.enabled || !EFFECTS[effect]) return;
      this.unlock();
      if (!this.available || !this.context) return;
      const context = this.context;
      let time = context.currentTime + .01, elapsed = 0;
      offset = Math.max(0, Number(offset) || 0);
      for (const [startHz, endHz, noteDuration] of EFFECTS[effect]) {
        const skipped = Math.max(0, offset - elapsed); elapsed += noteDuration + .015;
        if (skipped >= noteDuration) continue;
        const duration = noteDuration - skipped;
        const voice = context.createOscillator(), gain = context.createGain();
        voice.type = 'square'; voice.frequency.setValueAtTime(startHz, time);
        voice.frequency.exponentialRampToValueAtTime(endHz, time + duration);
        gain.gain.setValueAtTime(0, time);
        const volume = effect === 'finale' ? .035 : ['building', 'gorilla'].includes(effect) ? .098 : .055;
        gain.gain.linearRampToValueAtTime(volume, time + Math.min(.006, duration / 2));
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
