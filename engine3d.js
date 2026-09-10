/* Spatial rules. Coordinates: X/Z are streets, Y is altitude. No rendering dependency. */
(function (root) {
  'use strict';
  const base = typeof module !== 'undefined' && module.exports ? require('./engine.js') : root.Gorillas;
  const CELL = 8, SCALE = 1.25, SUN = { x: 0, y: 270, z: -240, radius: 23 };
  const phases = ['aiming', 'flying', 'impact', 'celebrating', 'roundOver', 'matchOver'];
  function launchVector(player, angle, power, direction = 0) {
    const elevation = angle * Math.PI / 180, heading = (direction + player * 180) * Math.PI / 180;
    return { vx: Math.cos(elevation) * Math.cos(heading) * power, vy: Math.sin(elevation) * power, vz: Math.cos(elevation) * Math.sin(heading) * power };
  }
  function pointAt(s, t, wind, gravity, windZ = 0) {
    return { x: s.startX + SCALE * (s.vx * t + wind / 10 * t * t), y: s.startY + SCALE * (s.vy * t - gravity / 2 * t * t), z: s.startZ + SCALE * (s.vz * t + windZ / 10 * t * t) };
  }
  const cellIndex = (b, x, y, z) => x + b.nx * (z + b.nz * y);
  function occupied(b, x, y, z) {
    return x >= 0 && x < b.nx && y >= 0 && y < b.ny && z >= 0 && z < b.nz && !b.removed.has(cellIndex(b, x, y, z));
  }
  function facingHeading(player, angle, direction) {
    // Overhead/backward elevations also turn the body toward the actual horizontal throw.
    return (direction + player * 180 + (Math.cos(angle * Math.PI / 180) < -1e-8 ? 180 : 0)) * Math.PI / 180;
  }
  function cityBounds(game) {
    const xs = game.plots.map(p => p.x), zs = game.plots.map(p => p.z);
    return { left: Math.min(...xs) - 36, right: Math.max(...xs) + 108, back: Math.min(...zs) - 36, front: Math.max(...zs) + 108, shore: Math.max(...zs) + 135 };
  }
  function windsockSites(game) {
    const sites = [];
    for (const b of game.buildings) {
      let site;
      for (let y = b.ny - 1; y >= 0 && !site; y--) {
        // Prefer a corner, away from a gorilla in the roof's centre.
        for (let z = 0; z < b.nz && !site; z++) for (let x = 0; x < b.nx; x++) {
          const cx = (x + 1) % b.nx, cz = (z + 1) % b.nz;
          if (occupied(b, cx, y, cz)) { site = { x: b.x + (cx + .5) * CELL, y: (y + 1) * CELL, z: b.z + (cz + .5) * CELL }; break; }
        }
      }
      if (site) sites.push(site);
    }
    sites.sort((a, b) => b.y - a.y || a.x - b.x || a.z - b.z);
    const bounds = cityBounds(game);
    return [...sites.slice(0, 2).map(site => ({ ...site, scale: .9 })),
      ...[.16, .76].map(t => ({ x: bounds.left + (bounds.right - bounds.left) * t, y: 1, z: bounds.shore + 21, scale: 1 }))];
  }
  function windPose(wind, windZ) {
    const speed = Math.hypot(wind, windZ);
    return { x: speed ? wind / speed : 0, z: speed ? windZ / speed : 0, extension: Math.min(1, speed / 14), speed };
  }
  class Game3D extends base.Game {
    newRound() {
      this.round++; this.phase = 'aiming'; this.shot = null; this.impact = null; this.winner = null;
      this.sunHit = false; this.lastEvent = 'start'; this.celebrationAge = 0; this.craters = []; this.buildings = []; this.plots = [];
      this.mode = '3d'; this.revision = (this.revision || 0) + 1;
      for (let row = -2; row < 6; row++) for (let col = -2; col < 8; col++) {
        const x = -270 + col * 94, z = -170 + row * 94;
        const spawn = (col === 0 && row === 1) || (col === 5 && row === 2);
        const kind = !spawn && ((col === 2 && row === 1) || (col === 3 && row === 1) || this.random() < .17) ? 'park' : !spawn && col === 3 && row === 3 ? 'plaza' : 'building';
        const plot = { x, z, kind, seed: this.integer(0, 100000) }; this.plots.push(plot);
        if (kind !== 'building') continue;
        const outer = row < 0 || row > 3 || col < 0 || col > 5;
        const nx = this.integer(5, 8), nz = this.integer(5, 8), ny = spawn ? this.integer(15, 19) : this.integer(4, outer ? 13 : 21);
        const b = { x: x + (72 - nx * CELL) / 2, z: z + (72 - nz * CELL) / 2, nx, ny, nz, width: nx * CELL, depth: nz * CELL, height: ny * CELL, color: this.integer(0, 4), seed: plot.seed, removed: new Set() };
        if (spawn) b.player = col === 0 ? 0 : 1;
        this.buildings.push(b);
      }
      this.gorillas = [0, 1].map(player => {
        const b = this.buildings.find(b => b.player === player);
        return { x: b.x + b.width / 2, y: b.height, z: b.z + b.depth / 2, alive: true };
      });
      this.gorillas.forEach((g, player) => { g.heading = this.opponentHeading(player); });
      this.wind = this.integer(-12, 12); this.windZ = this.integer(-8, 8);
    }
    opponentHeading(player) {
      const a = this.gorillas[player], b = this.gorillas[1 - player];
      return Math.atan2(b.z - a.z, b.x - a.x);
    }
    defaultDirection(player = this.turn) {
      return Math.round((this.opponentHeading(player) * 180 / Math.PI - player * 180 + 540) % 360 - 180);
    }
    setAim(angle, direction) {
      if (this.phase !== 'aiming' || ![angle, direction].every(Number.isFinite) || angle < 0 || angle > 360 || Math.abs(direction) > 180) return;
      this.gorillas[this.turn].heading = facingHeading(this.turn, angle, direction);
      this.gorillas[1 - this.turn].heading = this.opponentHeading(1 - this.turn);
    }
    fire(angle, power, direction = 0) {
      if (this.phase !== 'aiming' || ![angle, power, direction].every(Number.isFinite) || angle < 0 || angle > 360 || power < 0 || power > 360 || direction < -180 || direction > 180) return false;
      this.setAim(angle, direction);
      const g = this.gorillas[this.turn], velocity = launchVector(this.turn, angle, power, direction);
      const startX = g.x, startY = g.y + 34, startZ = g.z;
      this.lastShots[this.turn] = { angle, power, direction }; this.sunHit = false;
      this.shot = { startX, startY, startZ, x: startX, y: startY, z: startZ, ...velocity, time: 0, trail: [], charged: false };
      this.phase = 'flying'; this.lastEvent = 'throw';
      if (power < 2) this.collide({ type: 'gorilla', player: this.turn, x: g.x, y: g.y + 16, z: g.z });
      return true;
    }
    terrainAt(x, y, z) {
      for (let i = 0; i < this.buildings.length; i++) {
        const b = this.buildings[i];
        if (occupied(b, Math.floor((x - b.x) / CELL), Math.floor(y / CELL), Math.floor((z - b.z) / CELL))) return i + 1;
      }
      return 0;
    }
    collisionAt(x, y, z) {
      for (let player = 0; player < 2; player++) {
        const g = this.gorillas[player];
        // Rotate the collision query into the actor's own coordinates, matching its visible pose.
        const h = g.heading ?? this.opponentHeading(player), dx = x - g.x, dz = z - g.z;
        const side = Math.sin(h) * dx - Math.cos(h) * dz, forward = Math.cos(h) * dx + Math.sin(h) * dz;
        if (g.alive && ((Math.abs(side) <= 9 && Math.abs(forward) <= 7 && y >= g.y && y <= g.y + 29) || (Math.abs(side) <= 16 && Math.abs(forward) <= 6 && y >= g.y + 3 && y <= g.y + 20))) return { type: 'gorilla', player, x, y, z };
      }
      if (this.terrainAt(x, y, z) || (y <= 0 && Math.abs(x) <= 1800 && z >= -1800 && z <= cityBounds(this).shore + 42)) return { type: 'building', x, y, z };
      return null;
    }
    destroy(x, y, z, radius = 14) {
      this.craters.push({ x, y, z, radius }); this.revision++;
      for (const b of this.buildings) {
        const lo = [Math.max(0, Math.floor((x - radius - b.x) / CELL)), Math.max(0, Math.floor((y - radius) / CELL)), Math.max(0, Math.floor((z - radius - b.z) / CELL))];
        const hi = [Math.min(b.nx - 1, Math.floor((x + radius - b.x) / CELL)), Math.min(b.ny - 1, Math.floor((y + radius) / CELL)), Math.min(b.nz - 1, Math.floor((z + radius - b.z) / CELL))];
        for (let cy = lo[1]; cy <= hi[1]; cy++) for (let cz = lo[2]; cz <= hi[2]; cz++) for (let cx = lo[0]; cx <= hi[0]; cx++) {
          if (Math.hypot(b.x + (cx + .5) * CELL - x, (cy + .5) * CELL - y, b.z + (cz + .5) * CELL - z) <= radius + CELL * .35) b.removed.add(cellIndex(b, cx, cy, cz));
        }
      }
    }
    collide(hit) {
      const s = this.shot;
      const energy = s ? ((s.vx + this.wind / 5 * s.time) ** 2 + (s.vy - this.options.gravity * s.time) ** 2 + (s.vz + this.windZ / 5 * s.time) ** 2) / 2 : 0;
      const radius = (10 + 9 * energy / (energy + 3200)) * (s?.charged ? 1.2 : 1) * (hit.type === 'gorilla' ? 1.5 : 1);
      this.impact = { ...hit, age: 0, radius, charged: s?.charged === true }; this.phase = 'impact'; this.lastEvent = hit.type;
      this.destroy(hit.x, hit.y, hit.z, radius);
      if (hit.type === 'gorilla') { this.gorillas[hit.player].alive = false; this.winner = 1 - hit.player; this.scores[this.winner]++; }
    }
    update(seconds) {
      if (!Number.isFinite(seconds) || seconds <= 0) return;
      if (this.phase !== 'flying') { super.update(seconds); return; }
      if (this.impact) this.impact.age += seconds;
      let remaining = Math.min(seconds, .1) * (this.shot.y > 650 ? 30 : 3);
      while (remaining > 0 && this.phase === 'flying') {
        const dt = Math.min(remaining, 1 / 120); remaining -= dt;
        const s = this.shot, end = pointAt(s, s.time + dt, this.wind, this.options.gravity, this.windZ);
        const steps = Math.max(1, Math.ceil(Math.hypot(end.x - s.x, end.y - s.y, end.z - s.z)));
        for (let i = 1; i <= steps; i++) {
          const p = { x: s.x + (end.x - s.x) * i / steps, y: s.y + (end.y - s.y) * i / steps, z: s.z + (end.z - s.z) * i / steps };
          if (Math.abs(p.x) > 900 || Math.abs(p.z) > 900 || p.y < -20 || s.time > 160) { this.lastEvent = 'miss'; this.finishShot(); return; }
          if (Math.hypot(p.x - SUN.x, p.y - SUN.y, p.z - SUN.z) < SUN.radius && !s.charged) { s.charged = true; this.sunHit = true; this.lastEvent = 'sun'; }
          const hit = this.collisionAt(p.x, p.y, p.z);
          if (hit) { Object.assign(s, p); s.time += dt * i / steps; this.collide(hit); return; }
        }
        Object.assign(s, end); s.time += dt;
      }
      if (this.shot && this.phase === 'flying') { this.shot.trail.push({ x: this.shot.x, y: this.shot.y, z: this.shot.z }); if (this.shot.trail.length > 32) this.shot.trail.shift(); }
    }
    snapshot() {
      const state = super.snapshot(); state.version = 3;
      state.buildings = this.buildings.map(b => ({ ...b, removed: [...b.removed] }));
      return state;
    }
    restore(state) {
      if (!state || state.version !== 3 || state.mode !== '3d' || !phases.includes(state.phase)) return false;
      const finite = (o, keys) => o && keys.every(k => Number.isFinite(o[k]));
      if (!state.options || !Array.isArray(state.options.names) || state.options.names.length !== 2 || !state.options.names.every(n => typeof n === 'string') || !finite(state.options, ['gravity', 'target']) || state.options.gravity < .5 || state.options.gravity > 30 || !Number.isInteger(state.options.target) || state.options.target < 1 || state.options.target > 99) return false;
      if (!Array.isArray(state.scores) || state.scores.length !== 2 || !state.scores.every(n => Number.isInteger(n) && n >= 0) || ![0, 1].includes(state.turn) || ![null, 0, 1].includes(state.winner) || !finite(state, ['wind', 'windZ', 'round', 'celebrationAge', 'revision'])) return false;
      if (!Array.isArray(state.gorillas) || state.gorillas.length !== 2 || state.gorillas.some(g => !finite(g, ['x', 'y', 'z']) || typeof g.alive !== 'boolean' || (g.heading !== undefined && !Number.isFinite(g.heading)))) return false;
      if (!Array.isArray(state.buildings) || state.buildings.length < 2 || state.buildings.length > 80 || state.buildings.some(b => !finite(b, ['x', 'z', 'nx', 'ny', 'nz', 'width', 'height', 'depth', 'seed', 'color']) || !['nx', 'ny', 'nz'].every(k => Number.isInteger(b[k]) && b[k] > 0 && b[k] <= 24) || b.width !== b.nx * CELL || b.height !== b.ny * CELL || b.depth !== b.nz * CELL || !Number.isInteger(b.color) || b.color < 0 || b.color > 4 || !Array.isArray(b.removed) || b.removed.some(v => !Number.isInteger(v) || v < 0 || v >= b.nx * b.ny * b.nz))) return false;
      if (!Array.isArray(state.plots) || ![24, 48, 80].includes(state.plots.length) || state.plots.some(p => !finite(p, ['x', 'z', 'seed']) || !['building', 'park', 'plaza'].includes(p.kind)) || !Array.isArray(state.craters) || state.craters.some(c => !finite(c, ['x', 'y', 'z', 'radius']) || c.radius <= 0)) return false;
      if (!Array.isArray(state.lastShots) || state.lastShots.length !== 2 || state.lastShots.some(s => s && !finite(s, ['angle', 'power', 'direction']))) return false;
      if (state.shot && (!finite(state.shot, ['startX', 'startY', 'startZ', 'x', 'y', 'z', 'vx', 'vy', 'vz', 'time']) || !Array.isArray(state.shot.trail) || state.shot.trail.some(p => !finite(p, ['x', 'y', 'z'])))) return false;
      if ((state.phase === 'flying' && !state.shot) || (['impact', 'celebrating', 'roundOver', 'matchOver'].includes(state.phase) && !state.impact) || (['celebrating', 'roundOver', 'matchOver'].includes(state.phase) && state.winner === null)) return false;
      if (state.impact && (!finite(state.impact, ['x', 'y', 'z', 'radius', 'age']) || !['gorilla', 'building'].includes(state.impact.type) || (state.impact.type === 'gorilla' && ![0, 1].includes(state.impact.player)))) return false;
      const copy = JSON.parse(JSON.stringify(state));
      for (const key of ['options', 'scores', 'turn', 'round', 'lastShots', 'phase', 'shot', 'impact', 'winner', 'sunHit', 'lastEvent', 'celebrationAge', 'buildings', 'gorillas', 'wind', 'windZ', 'plots', 'craters', 'revision']) this[key] = copy[key];
      this.buildings.forEach(b => { b.removed = new Set(b.removed); }); this.mode = '3d';
      this.gorillas.forEach((g, player) => { if (!Number.isFinite(g.heading)) g.heading = this.opponentHeading(player); });
      return true;
    }
  }
  const api = { Game3D, CELL, SUN, launchVector, pointAt, occupied, cellIndex, facingHeading, cityBounds, windsockSites, windPose };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Gorillas3D = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
