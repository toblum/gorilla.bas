/* GORILLA.BAS PLAY scores and QBasic's monophonic PC speaker.
 * O0 C = C1 (32.703 Hz), N1 = O0 C; see reference/README.md.
 * The browser supplies a band-limited square wave, not a hardware emulator.
 */
(function(root) {
  'use strict';
  const melodies = {
    throw: 'MBO0L32A-L64CL16BL64A+', building: 'MBO0L32EFGEFDC',
    gorilla: 'MBO0L16EFGEFDC', dance: 'MFO0L32EFGEFDC',
    title: 'MBT160O1L8CDEDCDL4ECC'
  };
  const introPhrases = [
    'T120O1L16B9N0BAAN0BN0BN0BAAAN0B9N0BAAN0B',
    'O2L16E-9N0E-D-D-N0E-N0E-N0E-D-D-D-N0E-9N0E-D-D-N0E-',
    'O2L16G-9N0G-EEN0G-N0G-N0G-EEEN0G-9N0G-EEN0G-',
    'O2L16B9N0BAAN0G-N0G-N0G-EEEN0O1B9N0BAAN0B',
    ...Array(8).fill('T160O0L32EFGEFDC')
  ];
  class Score {
    constructor() { this.tempo = 120; this.octave = 4; this.length = 4; this.gate = 7 / 8; }
    compile(mml) {
      mml = mml.toUpperCase();
      let i = 0, time = 0; const notes = [];
      const number = () => { let n = ''; while (i < mml.length && /\d/.test(mml[i])) n += mml[i++]; return Number(n) || 0; };
      while (i < mml.length) {
        const ch = mml[i++];
        if (ch === 'M') { const mode = mml[i++]; if ('NLS'.includes(mode)) this.gate = {N: 7 / 8, L: 1, S: 3 / 4}[mode]; continue; }
        if (ch === 'T') { this.tempo = number(); continue; }
        if (ch === 'O') { this.octave = number(); continue; }
        if (ch === 'L') { this.length = number(); continue; }
        if (ch === '>') { this.octave = Math.min(6, this.octave + 1); continue; }
        if (ch === '<') { this.octave = Math.max(0, this.octave - 1); continue; }
        if (!'ABCDEFGNP'.includes(ch)) continue;
        let midi = 0, length = this.length;
        if (ch === 'N') { const n = number(); midi = n ? n + 23 : 0; }
        else if (ch === 'P') length = number() || length;
        else {
          midi = 12 * (this.octave + 2) + {C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11}[ch];
          if (['-', '+', '#'].includes(mml[i])) midi += mml[i++] === '-' ? -1 : 1;
          length = number() || length;
        }
        let duration = 240 / this.tempo / length, extra = duration / 2;
        while (mml[i] === '.') { i++; duration += extra; extra /= 2; }
        notes.push({time, duration, gate: this.gate, hz: midi ? 440 * 2 ** ((midi - 69) / 12) : 0});
        time += duration;
      }
      return {notes, duration: time};
    }
    intro() {
      const notes = [], poses = []; let programTime = 1, audioEnd = 0;
      for (let step = 0; step < introPhrases.length; step++) {
        poses.push({time: programTime, step});
        const phrase = this.compile(introPhrases[step]);
        for (const note of phrase.notes) {
          // MB blocks the BASIC program when its 32-note/rest queue fills.
          if (notes.length >= 32) {
            const oldest = notes[notes.length - 32];
            programTime = Math.max(programTime, oldest.time + oldest.duration);
          }
          const time = Math.max(programTime, audioEnd);
          notes.push({...note, time}); audioEnd = time + note.duration;
        }
        programTime += step < 4 ? .3 : .1;
      }
      // Let the last buffered notes finish before enabling browser shot input.
      return {notes, poses, duration: Math.max(programTime, audioEnd)};
    }
  }
  class Speaker {
    constructor(sound) { this.sound = sound; this.end = 0; }
    reset() { this.end = 0; }
    play(score, offset = 0) {
      const sound = this.sound;
      if (!sound.enabled) return;
      sound.unlock();
      if (!sound.available || !sound.context) return;
      const context = sound.context, start = Math.max(context.currentTime + .005, this.end);
      for (const note of score.notes) {
        const from = Math.max(offset, note.time), until = note.time + note.duration * note.gate;
        if (!note.hz || from >= until) continue;
        const time = start + from - offset, end = start + until - offset;
        const voice = context.createOscillator(), gain = context.createGain();
        voice.type = 'square'; voice.frequency.setValueAtTime(note.hz, time);
        // Constant speaker gate: no bass sweep or fading synth envelope.
        gain.gain.setValueAtTime(.28, time); gain.gain.setValueAtTime(0, end);
        voice.connect(gain); gain.connect(context.destination); sound.voices.add(voice);
        voice.onended = () => { sound.voices.delete(voice); voice.disconnect(); gain.disconnect(); };
        voice.start(time); voice.stop(end);
      }
      this.end = start + Math.max(0, score.duration - offset);
    }
  }
  const api = {Score, Speaker, melodies, introPhrases};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ClassicSound = api;
})(globalThis);
