/* Distant, decorative air traffic. Independent of the game and its random skyline. */
(function (root) {
  'use strict';
  const TYPES = [
    { kind: 'zeppelin', weight: 32, speed: 12 },
    { kind: 'balloon', weight: 26, speed: 9 },
    { kind: 'plane', weight: 34, speed: 32 },
    { kind: 'ufo', weight: 6, speed: 65 },
    { kind: 'paper', weight: 2, speed: 20 }
  ];
  class Scenery {
    constructor(random = Math.random) {
      this.random = random; this.time = 0; this.object = null; this.wait = 4 + random() * 6;
    }
    update(dt) {
      if (!Number.isFinite(dt) || dt <= 0) return;
      this.time += dt;
      if (this.object) {
        this.object.x += this.object.direction * this.object.speed * dt;
        if (this.object.x > 855 || this.object.x < -55) {
          this.object = null; this.wait = 12 + this.random() * 20;
        }
      } else {
        this.wait -= dt;
        if (this.wait > 0) return;
        let choice = this.random() * 100;
        const type = TYPES.find(t => (choice -= t.weight) < 0) || TYPES[TYPES.length - 1];
        const direction = this.random() < .5 ? 1 : -1;
        this.object = { ...type, direction, x: direction === 1 ? -50 : 850, y: 48 + this.random() * 75 };
      }
    }
    draw(ctx) {
      // A small flock travels much farther behind the foreground actors.
      const flockX = (this.time * 15 + 170) % 950 - 75;
      ctx.save(); ctx.strokeStyle = '#626f78'; ctx.globalAlpha = .32; ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const x = Math.round(flockX - i * 11), y = Math.round(42 + Math.abs(i - 2) * 4 + Math.sin(this.time * .4) * 3);
        const wing = Math.sin(this.time * 3 + i * .8) * 2;
        ctx.beginPath(); ctx.moveTo(x - 3, y - wing); ctx.lineTo(x, y); ctx.lineTo(x + 3, y - wing); ctx.stroke();
      }
      ctx.restore();
      const o = this.object; if (!o) return;
      ctx.save(); ctx.translate(Math.round(o.x), Math.round(o.y + Math.sin(this.time * .3) * 2));
      ctx.scale(o.direction, 1); ctx.globalAlpha = .3;
      ctx.fillStyle = '#6e7d87'; ctx.strokeStyle = '#6e7d87'; ctx.lineWidth = 1;
      if (o.kind === 'zeppelin') {
        ctx.beginPath(); ctx.ellipse(0, 0, 29, 8, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-20, 0); ctx.lineTo(-32, -12); ctx.lineTo(-29, 0); ctx.lineTo(-32, 10); ctx.closePath(); ctx.fill();
        ctx.fillRect(-4, 8, 13, 4); ctx.fillStyle = '#e0c5af'; ctx.fillRect(-19, -3, 36, 2);
      } else if (o.kind === 'balloon') {
        ctx.fillStyle = '#ae8a84'; ctx.beginPath(); ctx.ellipse(0, -4, 13, 16, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e5c6ab'; ctx.beginPath(); ctx.ellipse(0, -5, 5, 15, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-6, 9); ctx.lineTo(-3, 19); ctx.moveTo(6, 9); ctx.lineTo(3, 19); ctx.stroke();
        ctx.fillStyle = '#776f6a'; ctx.fillRect(-4, 18, 8, 5);
      } else if (o.kind === 'plane') {
        ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(-25, -7); ctx.lineTo(-20, -7); ctx.lineTo(-14, -1);
        ctx.lineTo(-3, -1); ctx.lineTo(-9, -13); ctx.lineTo(-4, -13); ctx.lineTo(8, -1);
        ctx.lineTo(23, 1); ctx.lineTo(25, 3); ctx.lineTo(4, 4); ctx.lineTo(-7, 13); ctx.lineTo(-12, 13);
        ctx.lineTo(-7, 4); ctx.lineTo(-24, 3); ctx.closePath(); ctx.fill();
      } else if (o.kind === 'ufo') {
        ctx.beginPath(); ctx.ellipse(0, -3, 7, 6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 1, 19, 4, 0, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#f9e8ae'; for (let x = -10; x <= 10; x += 10) ctx.fillRect(x, 3, 2, 1);
      } else {
        ctx.fillStyle = '#f8e6ca'; ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(22, 0); ctx.lineTo(-9, 8); ctx.lineTo(-5, 0); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-16, -10); ctx.lineTo(-5, 0); ctx.lineTo(22, 0); ctx.stroke();
      }
      ctx.restore();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Scenery, TYPES };
  else root.GorillaScenery = Scenery;
})(globalThis);
