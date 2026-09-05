/* Independent game rules; also runs in Node for deterministic physics tests. */
(function (root) {
  'use strict';
  const WIDTH = 800, HEIGHT = 420, FLOOR = 408, SCALE = 1.25, CRATER = 11;
  const SPRITE = [
    '.....######.....', '....########....', '....##eeee##....',
    '....##ffff##....', '.....######.....', '..############..',
    '.##############.', '################', '################',
    '######ffff######', '#####ffffff#####', '###.#ffffff#.###',
    '###.##ffff##.###', '....###..###....', '...####..####...',
    '..#####..#####..', '..####....####..'
  ];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  function pointAt(shot, time, wind, gravity) {
    return { x: shot.startX + SCALE * (shot.vx * time + wind / 10 * time * time),
      y: shot.startY + SCALE * (-shot.vy * time + gravity / 2 * time * time) };
  }
  function gorillaPixel(gorilla, x, y) {
    const col = Math.floor((x - gorilla.x + 16) / 2), row = Math.floor((y - gorilla.y) / 2);
    return row >= 0 && row < SPRITE.length && col >= 0 && col < 16 && SPRITE[row][col] !== '.';
  }
  class Game {
    constructor(options = {}, random = Math.random) { this.random = random; this.reset(options); }
    reset(options = this.options) {
      this.options = {
        names: [0, 1].map(i => String(options.names?.[i] || `Spieler ${i + 1}`).trim().slice(0, 18) || `Spieler ${i + 1}`),
        target: clamp(Math.round(Number(options.target) || 3), 1, 99),
        gravity: clamp(Number(options.gravity) || 9.8, .5, 30)
      };
      this.scores = [0, 0]; this.turn = 0; this.round = 0;
      this.lastShots = [null, null]; this.newRound();
    }
    integer(min, max) { return min + Math.floor(this.random() * (max - min + 1)); }
    newRound() {
      this.round++; this.phase = 'aiming'; this.shot = null; this.impact = null;
      this.winner = null; this.sunHit = false; this.lastEvent = 'start';
      this.buildings = []; this.craters = []; this.terrain = new Uint8Array(WIDTH * HEIGHT);
      const slope = this.integer(0, 3);
      for (let x = 0; x < WIDTH;) {
        const width = Math.min(this.integer(48, 88), WIDTH - x);
        const fraction = x / WIDTH;
        const trend = [fraction, 1 - fraction, 1 - Math.abs(fraction * 2 - 1), Math.abs(fraction * 2 - 1)][slope];
        const height = Math.round(78 + trend * 110 + this.integer(0, 105));
        const building = { x, y: FLOOR - height, width: width - 2, height, color: this.integer(0, 3), windows: [] };
        for (let wx = 7; wx < building.width - 5; wx += 11) {
          for (let wy = 9; wy < height - 7; wy += 16) building.windows.push({ x: x + wx, y: building.y + wy, lit: this.random() > .26 });
        }
        this.buildings.push(building);
        for (let y = building.y; y < FLOOR; y++) this.terrain.fill(this.buildings.length, y * WIDTH + x, y * WIDTH + x + building.width);
        x += width;
      }
      this.gorillas = [this.integer(1, 2), this.buildings.length - 1 - this.integer(1, 2)].map(index => {
        const b = this.buildings[index]; return { x: Math.round(b.x + b.width / 2), y: b.y - 34, alive: true };
      });
      this.wind = this.integer(-4, 5);
      if (this.integer(1, 3) === 1) this.wind += (this.wind > 0 ? 1 : -1) * this.integer(1, 10);
    }
    fire(angle, power) {
      if (this.phase !== 'aiming' || !Number.isFinite(angle) || !Number.isFinite(power) || angle < 0 || angle > 360 || power < 0 || power > 360) return false;
      const radians = (this.turn === 0 ? angle : 180 - angle) * Math.PI / 180;
      const gorilla = this.gorillas[this.turn];
      const startX = gorilla.x + (this.turn === 0 ? -18 : 18), startY = gorilla.y - 6;
      this.lastShots[this.turn] = { angle, power }; this.sunHit = false;
      this.shot = { startX, startY, x: startX, y: startY, vx: Math.cos(radians) * power, vy: Math.sin(radians) * power, time: 0, trail: [] };
      this.phase = 'flying'; this.lastEvent = 'throw';
      if (power < 2) this.collide({ type: 'gorilla', player: this.turn, x: gorilla.x, y: gorilla.y + 16 });
      return true;
    }
    terrainAt(x, y) {
      const px = Math.floor(x), py = Math.floor(y);
      return px >= 0 && px < WIDTH && py >= 0 && py < HEIGHT ? this.terrain[py * WIDTH + px] : 0;
    }
    collisionAt(x, y) {
      // The banana has a small collision footprint. Probe the whole path, not just animation frames.
      for (let player = 0; player < 2; player++) {
        const gorilla = this.gorillas[player];
        if (gorilla.alive && [[0, 0], [-2, 0], [2, 0], [0, -2], [0, 2]].some(([dx, dy]) => gorillaPixel(gorilla, x + dx, y + dy))) return { type: 'gorilla', player, x, y };
      }
      if ([[0, 0], [-2, 0], [2, 0], [0, 2]].some(([dx, dy]) => this.terrainAt(x + dx, y + dy))) return { type: 'building', x, y };
      return null;
    }
    destroy(x, y, radius = CRATER) {
      this.craters.push({ x, y, radius });
      for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(HEIGHT - 1, Math.ceil(y + radius)); py++) {
        for (let px = Math.max(0, Math.floor(x - radius)); px <= Math.min(WIDTH - 1, Math.ceil(x + radius)); px++) {
          if ((px + .5 - x) ** 2 + (py + .5 - y) ** 2 <= radius ** 2) this.terrain[py * WIDTH + px] = 0;
        }
      }
    }
    collide(hit) {
      this.impact = { ...hit, age: 0 }; this.phase = 'impact'; this.lastEvent = hit.type;
      if (hit.type === 'building') this.destroy(hit.x, hit.y);
      if (hit.type === 'gorilla') {
        this.gorillas[hit.player].alive = false;
        this.winner = 1 - hit.player; this.scores[this.winner]++;
        this.destroy(hit.x, hit.y, 22);
      }
    }
    finishShot() {
      this.shot = null; this.sunHit = false;
      // Alternation continues across rounds, including after a self-hit.
      this.turn = 1 - this.turn;
      if (this.winner !== null) this.phase = this.scores[this.winner] >= this.options.target ? 'matchOver' : 'roundOver';
      else this.phase = 'aiming';
    }
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (this.phase === 'impact') {
        this.impact.age += seconds;
        if (this.impact.age >= (this.winner !== null ? 1 : .45)) this.finishShot();
        return;
      }
      if (this.phase !== 'flying') return;
      // Original game time runs faster than wall time. Invisible high arcs are accelerated.
      let remaining = Math.min(seconds, .1) * (this.shot.y < -100 ? 30 : 3);
      while (remaining > 0 && this.phase === 'flying') {
        const dt = Math.min(remaining, 1 / 120); remaining -= dt;
        const shot = this.shot, end = pointAt(shot, shot.time + dt, this.wind, this.options.gravity);
        const steps = Math.max(1, Math.ceil(Math.hypot(end.x - shot.x, end.y - shot.y)));
        for (let i = 1; i <= steps; i++) {
          const x = shot.x + (end.x - shot.x) * i / steps, y = shot.y + (end.y - shot.y) * i / steps;
          if (x < -6 || x > WIDTH + 6 || y > HEIGHT + 6) { this.lastEvent = 'miss'; this.finishShot(); return; }
          if (Math.hypot(x - WIDTH / 2, y - 61) < 23) this.sunHit = true;
          if (y >= -3) {
            const hit = this.collisionAt(x, y);
            if (hit) { shot.x = x; shot.y = y; this.collide(hit); return; }
          }
        }
        shot.x = end.x; shot.y = end.y; shot.time += dt;
      }
      if (this.shot && this.phase === 'flying') {
        this.shot.trail.push({ x: this.shot.x, y: this.shot.y });
        if (this.shot.trail.length > 12) this.shot.trail.shift();
      }
    }
    continue() {
      if (this.phase === 'roundOver') { this.newRound(); return true; }
      if (this.phase === 'matchOver') { this.reset(); return true; }
      return false;
    }
  }
  const api = { Game, WIDTH, HEIGHT, FLOOR, CRATER, SPRITE, pointAt, gorillaPixel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gorillas = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
