/* 3D game rules: the same duel with an added depth axis. Also runs in Node for deterministic tests. */
(function (root) {
  'use strict';
  const WORLD_X = 800, WORLD_Z = 500, SCALE = 1.25;
  const BLOCK = 68, STREET = 28, PITCH = BLOCK + STREET, COLS = 8, ROWS = 5;
  const ORIGIN_X = (WORLD_X - (COLS * BLOCK + (COLS - 1) * STREET)) / 2;
  const ORIGIN_Z = (WORLD_Z - (ROWS * BLOCK + (ROWS - 1) * STREET)) / 2;
  const FLOOR_H = 16, HALF = BLOCK / 2, GORILLA_HEIGHT = 34, GORILLA_RADIUS = 15;
  const SUN = { x: 470, y: 350, z: 150, radius: 28 };
  const CELEBRATION_DURATION = 2.4;
  const GORILLA_HALF = 1.8, GORILLA_SCALE = 1.35;
  // Voxel gorilla for the 3D city: box parts on a 3.6-unit grid, -z is the facing direction.
  const GORILLA3D_VOXELS = (() => {
    const voxels = [];
    const part = (x, y, z, w, h, d, part, side) => voxels.push({
      x: x * GORILLA_HALF, y: y * GORILLA_HALF, z: z * GORILLA_HALF,
      w: w * GORILLA_HALF, h: h * GORILLA_HALF, d: d * GORILLA_HALF, part, side
    });
    for (const side of [0, 1]) {
      const m = side ? -1 : 1;
      part(m * 1.7, 0, .1, 1.5, .8, 2.2, 'foot', side);
      part(m * 1.5, .8, 0, 1.3, 2.2, 1.8, 'leg', side);
      part(m * 3.9, 2.5, 0, 1.6, 3.5, 1.7, 'arm', side);
      part(m * 4.1, 0, .1, 1.8, 2.5, 1.9, 'arm', side);
    }
    part(0, 3, 0, 4.8, 3, 2.4, 'hips', -1);
    part(0, 6, 0, 6.6, 3, 2.7, 'chest', -1);
    part(0, 9, 0, 7.2, 1.6, 2.7, 'shoulder', -1);
    part(0, 10.6, .2, 4.6, 4, 3.6, 'head', -1);
    part(0, 11.1, -1.7, 3, 2.2, .8, 'face', -1);
    part(0, 13.4, -.4, 3.2, 1, 2.4, 'brow', -1);
    return voxels;
  })();
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  // Direction rotates the horizontal velocity around the vertical axis; positive is screen-right for the thrower.
  function launchVector3(player, angle, power, direction = 0) {
    const elevation = angle * Math.PI / 180, lateral = direction * Math.PI / 180;
    const horizontal = Math.cos(elevation) * power, sign = player === 0 ? 1 : -1;
    return { vx: sign * horizontal * Math.cos(lateral), vy: Math.sin(elevation) * power, vz: sign * horizontal * Math.sin(lateral) };
  }
  function pointAt3(shot, time, wind, gravity) {
    return {
      x: shot.startX + SCALE * (shot.vx * time + wind / 10 * time * time),
      y: shot.startY + SCALE * (shot.vy * time - gravity / 2 * time * time),
      z: shot.startZ + SCALE * (shot.vz * time)
    };
  }
  function blastRadius(shot, wind, gravity) {
    if (!shot) return 26;
    // Kinetic energy at impact, now including the lateral velocity component.
    const ex = shot.vx + wind / 5 * shot.time, ey = shot.vy - gravity * shot.time;
    const energy = (ex * ex + ey * ey + shot.vz * shot.vz) / 2;
    return (7.5 + 8 * energy / (energy + 3200)) * (shot.charged ? 1.2 : 1) * 2.4;
  }
  class Game3D {
    constructor(options = {}, random = Math.random) { this.random = random; this.reset(options); }
    reset(options = this.options || {}) {
      this.options = {
        names: [0, 1].map(i => String(options.names?.[i] || `Spieler ${i + 1}`).trim().slice(0, 18) || `Spieler ${i + 1}`),
        target: clamp(Math.round(Number(options.target) || 3), 1, 99),
        gravity: clamp(Number(options.gravity) || 9.8, .5, 30),
        aimAssist: options.aimAssist === true
      };
      this.scores = [0, 0]; this.turn = 0; this.round = 0;
      this.lastShots = [null, null]; this.newRound();
    }
    integer(min, max) { return min + Math.floor(this.random() * (max - min + 1)); }
    snapshot() {
      const { random, ...state } = this;
      return JSON.parse(JSON.stringify({ version: 1, ...state }));
    }
    restore(state) {
      if (!state || state.version !== 1 || !['aiming', 'flying', 'impact', 'celebrating', 'roundOver', 'matchOver'].includes(state.phase)) return false;
      if (!Array.isArray(state.blocks) || !Array.isArray(state.chunks) || !Array.isArray(state.craters) || !Array.isArray(state.gorillas) || state.gorillas.length !== 2) return false;
      if (!state.options || !Array.isArray(state.options.names) || state.options.names.length !== 2 || !Array.isArray(state.scores) || state.scores.length !== 2 || ![0, 1].includes(state.turn) || !Number.isInteger(state.round)) return false;
      if (!Number.isFinite(state.options.gravity) || !Number.isInteger(state.options.target) || !Number.isFinite(state.wind) || ![null, 0, 1].includes(state.winner)) return false;
      if (['celebrating', 'roundOver', 'matchOver'].includes(state.phase) && state.winner === null) return false;
      if (state.phase === 'flying' && !state.shot) return false;
      if (state.gorillas.some(g => !g || ![g.x, g.y, g.z].every(Number.isFinite) || typeof g.alive !== 'boolean')) return false;
      if (state.chunks.some(c => !c || ![c.x, c.y, c.z, c.w, c.h, c.d].every(Number.isFinite) || typeof c.alive !== 'boolean')) return false;
      const copy = JSON.parse(JSON.stringify(state));
      for (const key of ['options', 'scores', 'turn', 'round', 'lastShots', 'phase', 'shot', 'impact', 'winner', 'sunHit', 'lastEvent', 'celebrationAge', 'blocks', 'chunks', 'gorillas', 'wind', 'craters']) this[key] = copy[key];
      this.options.aimAssist = this.options.aimAssist === true;
      return true;
    }
    buildBlock(col, row, slope, forced) {
      const x = ORIGIN_X + col * PITCH, z = ORIGIN_Z + row * PITCH;
      const fraction = (x + HALF) / WORLD_X;
      const trend = [fraction, 1 - fraction, 1 - Math.abs(fraction * 2 - 1), Math.abs(fraction * 2 - 1)][slope];
      let type = 'building';
      if (!forced) { const roll = this.random(); type = roll < .15 ? 'park' : roll < .25 ? 'plaza' : 'building'; }
      const block = { x, z, type, height: 0, palette: 0, variant: 0, chunkStart: this.chunks.length, chunkCount: 0, trees: [] };
      if (type === 'building') {
        const floors = clamp(Math.round((78 + trend * 110 + this.integer(0, 105)) / FLOOR_H), 3, 17);
        block.height = floors * FLOOR_H; block.palette = this.integer(0, 3); block.variant = this.integer(0, 2);
        for (let f = 0; f < floors; f++) for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
          this.chunks.push({ x: x + i * HALF, y: f * FLOOR_H, z: z + j * HALF, w: HALF, h: FLOOR_H, d: HALF, side: block.palette * 3 + block.variant, alive: true });
          block.chunkCount++;
        }
      } else if (type === 'park') {
        const count = this.integer(4, 8);
        for (let i = 0; i < count; i++) block.trees.push({ x: x + 8 + this.random() * (BLOCK - 16), z: z + 8 + this.random() * (BLOCK - 16), s: 11 + this.random() * 9 });
      }
      return block;
    }
    newRound() {
      this.round++; this.phase = 'aiming'; this.shot = null; this.impact = null;
      this.winner = null; this.sunHit = false; this.lastEvent = 'start'; this.celebrationAge = 0;
      this.blocks = []; this.chunks = []; this.craters = [];
      const slope = this.integer(0, 3);
      const gorillaCols = [this.integer(1, 2), COLS - 1 - this.integer(1, 2)];
      const gorillaRows = [this.integer(0, ROWS - 1), this.integer(0, ROWS - 1)];
      for (let col = 0; col < COLS; col++) for (let row = 0; row < ROWS; row++) {
        const forced = col === gorillaCols[0] && row === gorillaRows[0] || col === gorillaCols[1] && row === gorillaRows[1];
        this.blocks.push(this.buildBlock(col, row, slope, forced));
      }
      this.gorillas = [0, 1].map(player => {
        const block = this.blocks[gorillaCols[player] * ROWS + gorillaRows[player]];
        return { x: block.x + HALF, y: block.height, z: block.z + HALF, alive: true };
      });
      this.wind = this.integer(-4, 5);
      if (this.integer(1, 3) === 1) this.wind += (this.wind > 0 ? 1 : -1) * this.integer(1, 10);
    }
    fire(angle, power, direction = 0) {
      if (this.phase !== 'aiming' || ![angle, power, direction].every(Number.isFinite)) return false;
      if (angle < 0 || angle > 360 || power < 0 || power > 360 || direction < -60 || direction > 60) return false;
      const velocity = launchVector3(this.turn, angle, power, direction);
      const gorilla = this.gorillas[this.turn];
      const startX = gorilla.x + (this.turn === 0 ? -18 : 18), startY = gorilla.y + GORILLA_HEIGHT + 6, startZ = gorilla.z;
      this.lastShots[this.turn] = { angle, power, direction }; this.sunHit = false;
      this.shot = { startX, startY, startZ, x: startX, y: startY, z: startZ, ...velocity, time: 0, trail: [], charged: false };
      this.phase = 'flying'; this.lastEvent = 'throw';
      if (power < 2) this.collide({ type: 'gorilla', player: this.turn, x: gorilla.x, y: gorilla.y + 17, z: gorilla.z });
      return true;
    }
    collisionAt(x, y, z) {
      for (let player = 0; player < 2; player++) {
        const g = this.gorillas[player];
        if (g.alive && (x - g.x) ** 2 + (y - g.y - 17) ** 2 + (z - g.z) ** 2 <= GORILLA_RADIUS ** 2) return { type: 'gorilla', player, x, y, z };
      }
      for (const b of this.blocks) {
        if (b.type !== 'building' || x < b.x || x > b.x + BLOCK || z < b.z || z > b.z + BLOCK || y > b.height || y < 0) continue;
        for (let i = b.chunkStart; i < b.chunkStart + b.chunkCount; i++) {
          const c = this.chunks[i];
          if (c.alive && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h && z >= c.z && z <= c.z + c.d) return { type: 'building', x, y, z };
        }
      }
      return null;
    }
    destroy(x, y, z, radius) {
      this.craters.push({ x, y, z, radius });
      for (const b of this.blocks) {
        if (b.type !== 'building') continue;
        if (x + radius < b.x || x - radius > b.x + BLOCK || z + radius < b.z || z - radius > b.z + BLOCK || y + radius < 0 || y - radius > b.height) continue;
        for (let i = b.chunkStart; i < b.chunkStart + b.chunkCount; i++) {
          const c = this.chunks[i];
          if (!c.alive) continue;
          if ((c.x + c.w / 2 - x) ** 2 + (c.y + c.h / 2 - y) ** 2 + (c.z + c.d / 2 - z) ** 2 <= (radius + 9) ** 2) c.alive = false;
        }
      }
    }
    collide(hit) {
      const radius = blastRadius(this.shot, this.wind, this.options.gravity) * (hit.type === 'gorilla' ? 1.5 : 1);
      this.impact = { ...hit, age: 0, radius, charged: this.shot?.charged === true }; this.phase = 'impact'; this.lastEvent = hit.type;
      if (hit.type === 'building' || hit.type === 'gorilla') this.destroy(hit.x, hit.y, hit.z, radius);
      else this.craters.push({ x: hit.x, y: 0, z: hit.z, radius }); // ground hits leave a scorch mark
      if (hit.type === 'gorilla') {
        this.gorillas[hit.player].alive = false;
        this.winner = 1 - hit.player; this.scores[this.winner]++;
      }
    }
    finishShot() {
      this.shot = null; this.sunHit = false;
      this.turn = 1 - this.turn;
      if (this.winner !== null) { this.phase = 'celebrating'; this.celebrationAge = 0; }
      else this.phase = 'aiming';
    }
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (this.impact) this.impact.age += seconds;
      if (this.phase === 'celebrating') {
        this.celebrationAge += seconds;
        if (this.celebrationAge >= CELEBRATION_DURATION) this.phase = this.scores[this.winner] >= this.options.target ? 'matchOver' : 'roundOver';
        return;
      }
      if (this.phase === 'impact') {
        if (this.impact.age >= (this.winner !== null ? .8 : .65)) this.finishShot();
        return;
      }
      if (this.phase !== 'flying') return;
      // Same pacing as the 2D game: invisible high arcs are accelerated.
      let remaining = Math.min(seconds, .1) * (this.shot.y > 550 ? 30 : 3);
      while (remaining > 0 && this.phase === 'flying') {
        const dt = Math.min(remaining, 1 / 120); remaining -= dt;
        const shot = this.shot, end = pointAt3(shot, shot.time + dt, this.wind, this.options.gravity);
        const steps = Math.max(1, Math.ceil(Math.hypot(end.x - shot.x, end.y - shot.y, end.z - shot.z)));
        for (let i = 1; i <= steps; i++) {
          const x = shot.x + (end.x - shot.x) * i / steps, y = shot.y + (end.y - shot.y) * i / steps, z = shot.z + (end.z - shot.z) * i / steps;
          if (x < -24 || x > WORLD_X + 24 || z < -24 || z > WORLD_Z + 24) { this.lastEvent = 'miss'; this.finishShot(); return; }
          if (Math.hypot(x - SUN.x, y - SUN.y, z - SUN.z) < SUN.radius) {
            this.sunHit = true;
            if (!shot.charged) { shot.charged = true; this.lastEvent = 'sun'; }
          }
          if (y <= 0) { shot.x = x; shot.y = 0; shot.z = z; shot.time += dt * i / steps; this.collide({ type: 'ground', x, y: 0, z }); return; }
          const hit = this.collisionAt(x, y, z);
          if (hit) { shot.x = x; shot.y = y; shot.z = z; shot.time += dt * i / steps; this.collide(hit); return; }
        }
        shot.x = end.x; shot.y = end.y; shot.z = end.z; shot.time += dt;
      }
      if (this.shot && this.phase === 'flying') {
        this.shot.trail.push({ x: this.shot.x, y: this.shot.y, z: this.shot.z });
        if (this.shot.trail.length > 12) this.shot.trail.shift();
      }
    }
    // Predicted flight path for the aim assist; pure function of the current inputs.
    predict(angle, power, direction) {
      const velocity = launchVector3(this.turn, angle, power, direction);
      const gorilla = this.gorillas[this.turn];
      const shot = { startX: gorilla.x + (this.turn === 0 ? -18 : 18), startY: gorilla.y + GORILLA_HEIGHT + 6, startZ: gorilla.z, ...velocity };
      const points = []; let hit = null;
      for (let t = 0; t <= 30; t += 1 / 30) {
        const p = pointAt3(shot, t, this.wind, this.options.gravity);
        if (p.x < -24 || p.x > WORLD_X + 24 || p.z < -24 || p.z > WORLD_Z + 24) { hit = 'miss'; break; }
        if (p.y <= 0) { points.push({ x: p.x, y: 0, z: p.z }); hit = 'ground'; break; }
        points.push(p);
        if (Math.hypot(p.x - SUN.x, p.y - SUN.y, p.z - SUN.z) < SUN.radius) shot.charged = true;
        if (t > 0 && this.collisionAt(p.x, p.y, p.z)) { hit = 'building'; break; }
      }
      const stride = Math.max(1, Math.ceil(points.length / 96));
      return { points: points.filter((_, i) => i % stride === 0 || i === points.length - 1), hit };
    }
    continue() {
      if (this.phase === 'roundOver') { this.newRound(); return true; }
      if (this.phase === 'matchOver') { this.reset(); return true; }
      return false;
    }
  }
  const api = { Game3D, WORLD_X, WORLD_Z, SCALE, BLOCK, STREET, PITCH, COLS, ROWS, ORIGIN_X, ORIGIN_Z, FLOOR_H, GORILLA_HEIGHT, GORILLA3D_VOXELS, SUN, CELEBRATION_DURATION, launchVector3, pointAt3, blastRadius };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Gorillas3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
