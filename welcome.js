/* Lightweight mode previews, isolated from the live match and WebGL renderer. */
(function (root) {
  'use strict';
  class GorillaWelcome {
    constructor(canvas) {
      this.ctx = canvas.getContext('2d');
      this.mode = '2d';
      this.lastFrame = '';
      this.classicCanvas = document.createElement('canvas');
      this.classicCanvas.width = 400; this.classicCanvas.height = 230;
      // Reuse the original filled EGA sun, including its face and rays.
      const sunScreen = new root.GorillasClassic.Screen();
      root.GorillasClassic.drawSun(sunScreen);
      this.classicSun = sunScreen.get(298, 7, 45, 37);
    }
    setMode(mode) { this.mode = mode; }
    draw(time, reducedMotion) {
      // Freeze every animation component when reduced motion is requested.
      const tick = reducedMotion ? 12 : Math.floor(time / 80);
      const frame = `${this.mode}:${tick}`;
      if (this.lastFrame === frame) return;
      this.lastFrame = frame;
      const t = (tick % 48) / 48, reverse = Math.floor(tick / 48) % 2;
      const progress = reverse ? 1 - t : t;
      const pose = ['left', 'both', 'right', 'both'][Math.floor(tick / 4) % 4];
      if (this.mode === 'classic') { this.drawClassic(progress, t, tick); return; }
      const ctx = this.ctx, spatial = this.mode === '3d';
      ctx.fillStyle = spatial ? '#b2cccd' : '#ebae90'; ctx.fillRect(0, 0, 400, 230);
      ctx.fillStyle = '#ffdf96'; ctx.beginPath(); ctx.arc(205, 48, 26, 0, Math.PI * 2); ctx.fill();
      if (spatial) this.drawSpatial(progress, t, pose);
      else {
        for (let i = 0; i < 9; i++) this.building(i * 49 - 12, 230, 45, 35 + (i * 37) % 65, false);
        this.building(28, 230, 96, 61, false); this.building(276, 230, 96, 61, false);
        ctx.save(); ctx.scale(2, 2);
        root.GorillaVisuals.drawGorilla(ctx, 38, 50, 0, pose);
        root.GorillaVisuals.drawGorilla(ctx, 162, 50, 1, pose); ctx.restore();
        root.GorillaVisuals.drawBanana(ctx, 80 + 240 * progress, 91 - Math.sin(t * Math.PI) * 64, t * Math.PI * 2);
      }
    }
    building(x, y, width, height, spatial) {
      const ctx = this.ctx;
      ctx.fillStyle = '#405b62'; ctx.fillRect(x, y - height, width, height);
      if (spatial) {
        ctx.fillStyle = '#77938e'; ctx.beginPath(); ctx.moveTo(x, y - height);
        ctx.lineTo(x + 22, y - height - 16); ctx.lineTo(x + width + 22, y - height - 16);
        ctx.lineTo(x + width, y - height); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#293e49'; ctx.beginPath(); ctx.moveTo(x + width, y - height);
        ctx.lineTo(x + width + 22, y - height - 16); ctx.lineTo(x + width + 22, y - 16);
        ctx.lineTo(x + width, y); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#f3d3a0';
      for (let wx = 8; wx < width - 4; wx += 14)
        for (let wy = 10; wy < height - 4; wy += 16) ctx.fillRect(x + wx, y - height + wy, 4, 6);
    }
    drawSpatial(progress, t, pose) {
      const ctx = this.ctx;
      ctx.fillStyle = '#718985'; ctx.fillRect(0, 134, 400, 96);
      ctx.strokeStyle = '#c2c6ae'; ctx.lineWidth = 5;
      for (let i = -2; i < 8; i++) {
        ctx.beginPath(); ctx.moveTo(i * 90, 230); ctx.lineTo(i * 90 + 150, 134); ctx.stroke();
      }
      for (let i = 0; i < 5; i++) this.building(i * 92 - 15, 155, 48, 28 + i % 3 * 15, true);
      this.building(272, 160, 64, 62, true);
      root.GorillaVisuals.drawGorilla(ctx, 313, 58, 1, pose);
      this.building(42, 230, 90, 65, true);
      ctx.save(); ctx.translate(93, 108); ctx.scale(1.5, 1.5);
      root.GorillaVisuals.drawGorilla(ctx, 0, 0, 0, pose); ctx.restore();
      // A diagonal throw and changing sprite scale communicate the depth axis.
      ctx.save(); ctx.translate(93 + 220 * progress, 105 - 48 * progress - Math.sin(t * Math.PI) * 65);
      ctx.scale(1.4 - .6 * progress, 1.4 - .6 * progress);
      root.GorillaVisuals.drawBanana(ctx, 0, 0, t * Math.PI * 2); ctx.restore();
    }
    drawClassic(progress, t, tick) {
      const { Screen, drawGorilla, bananas } = root.GorillasClassic;
      const screen = new Screen(400, 230);
      for (let i = 0; i < 8; i++) {
        const top = i === 1 || i === 6 ? 174 : 140 + i * 23 % 45;
        screen.box(i * 52, top, i * 52 + 48, 230, 5 + i % 3);
        for (let x = 8; x < 44; x += 12)
          for (let y = top + 8; y < 220; y += 14) screen.box(i * 52 + x, y, i * 52 + x + 3, y + 5, 14);
      }
      screen.put(178, 22, this.classicSun);
      const arms = [1, 3, 2, 3][Math.floor(tick / 4) % 4];
      drawGorilla(screen, 76, 144, arms); drawGorilla(screen, 337, 144, arms);
      screen.put(76 + 261 * progress, 112 - Math.sin(t * Math.PI) * 65, bananas[tick % bananas.length]);
      this.classicCanvas.getContext('2d').putImageData(new ImageData(screen.rgba(), 400, 230), 0, 0);
      this.ctx.drawImage(this.classicCanvas, 0, 0);
    }
  }
  root.GorillaWelcome = GorillaWelcome;
})(window);
