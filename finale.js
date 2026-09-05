/* A twenty-second, skippable reward after a complete match. */
(function (root) {
  'use strict';
  class Finale {
    static DURATION = 20;
    constructor(finish, age = 0) { this.finish = finish; this.age = Math.max(0, Math.min(Finale.DURATION, Number(age) || 0)); this.done = false; }
    update(dt) { if (this.done) return; if (Number.isFinite(dt) && dt > 0) this.age += dt; if (this.age >= Finale.DURATION) this.skip(); }
    skip() { if (this.done) return; this.done = true; this.finish(); }
    draw(ctx, player, reducedMotion, drawGorilla) {
      const t = reducedMotion ? 3 : this.age * .4;
      const lift = Math.max(0, t - 2);
      ctx.fillStyle = '#1e303d'; ctx.fillRect(0, 0, 800, 400);
      for (let i = 0; i < 65; i++) {
        const x = (i * 137 + 23) % 800, y = ((i * 79 + 17) + lift * 24) % 400;
        ctx.fillStyle = i % 3 ? '#809895' : '#f6dfb1'; ctx.fillRect(x, Math.floor(y), i % 3 ? 2 : 3, 2);
      }
      // A banana moon watches its newest visitor arrive.
      ctx.fillStyle = '#f4d584'; ctx.beginPath(); ctx.arc(664, 80, 43, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e303d'; ctx.beginPath(); ctx.arc(647, 65, 40, 0, Math.PI * 2); ctx.fill();
      const ground = Math.min(200, lift * 65);
      for (let i = 0; i < 15; i++) {
        const h = 45 + (i * 41) % 85, y = 400 - h + ground;
        ctx.fillStyle = i % 2 ? '#4e6e73' : '#36515f'; ctx.fillRect(i * 57 - 12, y, 51, h);
        ctx.fillStyle = '#ecc88e';
        for (let row = 12; row < h; row += 17) for (let col = 8; col < 44; col += 12) ctx.fillRect(i * 57 - 12 + col, y + row, 4, 6);
      }
      // Confetti belongs behind the rider, never across its face or chest.
      if (t > 4) for (let i = 0; i < 24; i++) {
        ctx.fillStyle = ['#f3854e', '#b9d4b6', '#ffe18b'][i % 3];
        ctx.fillRect((i * 103 + 31) % 800, ((i * 47 + t * 45) % 360), 5, 9);
      }
      ctx.save(); ctx.translate(Math.round(400 + (reducedMotion ? 0 : Math.sin(t * 3) * 3)), Math.round(260 - Math.min(100, lift * 19)));
      // The world's least sensible spacecraft: one enormous banana.
      if (t > 1.5) {
        ctx.fillStyle = '#f47b48'; ctx.beginPath(); ctx.moveTo(-25, 39); ctx.lineTo(0, 95 + (reducedMotion ? 0 : Math.sin(t * 22) * 12)); ctx.lineTo(25, 39); ctx.fill();
        ctx.fillStyle = '#fff0b1'; ctx.beginPath(); ctx.moveTo(-13, 40); ctx.lineTo(0, 72); ctx.lineTo(13, 40); ctx.fill();
      }
      // A tapered fruit silhouette, broad at the belly, with a stalk at only one end.
      ctx.fillStyle = '#b98437'; ctx.beginPath(); ctx.moveTo(-143, -41);
      ctx.bezierCurveTo(-103, 74, 74, 87, 145, -34);
      ctx.bezierCurveTo(153, -48, 153, -60, 149, -67);
      ctx.bezierCurveTo(91, 11, -35, 41, -143, -41); ctx.fill();
      ctx.fillStyle = '#ffda58'; ctx.beginPath(); ctx.moveTo(-136, -31);
      ctx.bezierCurveTo(-94, 65, 74, 73, 139, -34);
      ctx.bezierCurveTo(80, 24, -40, 44, -136, -31); ctx.fill();
      ctx.strokeStyle = '#fff09b'; ctx.lineWidth = 5; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-107, -8); ctx.bezierCurveTo(-37, 47, 68, 40, 120, -13); ctx.stroke();
      ctx.strokeStyle = '#d6aa42'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-104, 7); ctx.bezierCurveTo(-29, 65, 75, 47, 129, -14); ctx.stroke();
      ctx.fillStyle = '#81703c'; ctx.beginPath(); ctx.moveTo(140, -38); ctx.lineTo(149, -72); ctx.lineTo(164, -78); ctx.lineTo(166, -69); ctx.lineTo(156, -64); ctx.lineTo(151, -42); ctx.fill();
      ctx.fillStyle = '#6e4b2c'; ctx.beginPath(); ctx.moveTo(-143, -41); ctx.lineTo(-151, -45); ctx.lineTo(-146, -32); ctx.lineTo(-136, -28); ctx.fill();
      // Integer scaling and placement keep adjacent sprite pixels opaque:
      // fractional rectangles otherwise leave antialiased, moving seams.
      ctx.scale(3, 3);
      drawGorilla(ctx, 0, -28, player, reducedMotion ? 'both' : ['left', 'both', 'right', 'both'][Math.floor(t * 5) % 4]);
      ctx.restore();
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { Finale };
  else root.GorillaFinale = Finale;
})(typeof globalThis !== 'undefined' ? globalThis : this);
