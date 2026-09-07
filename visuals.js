/* Pixel-art actors and effects, shared by the game and visual review page. */
(function (root) {
  'use strict';
  const { SPRITE } = root.Gorillas;
  const FUR = [
    { '#': '#d77b39', s: '#a45e33', h: '#e89b50', c: '#de8c4a', p: '#e39554', f: '#c7996c', d: '#493627' },
    { '#': '#8aab92', s: '#5f806a', h: '#adc49e', c: '#99b49b', p: '#a2bba0', f: '#adb69a', d: '#364c3e' }
  ];
  const poses = new Map();
  function posePixels(pose) {
    if (poses.has(pose)) return poses.get(pose);
    const pixels = new Map();
    for (let row = 0; row < SPRITE.length; row++) for (let col = 0; col < SPRITE[row].length; col++) {
      const pixel = SPRITE[row][col]; if (pixel === '.') continue;
      const leftArm = col < 8 && row >= 11 && row <= 29;
      const rightArm = col > 23 && row >= 11 && row <= 29;
      if (!(leftArm && ['left', 'both'].includes(pose)) && !(rightArm && ['right', 'both'].includes(pose))) pixels.set(`${col},${row}`, [col, row, pixel]);
    }
    // Inverse sampling keeps rotating arms solid instead of leaving gaps between pixels.
    for (const left of [true, false]) {
      if (!(left ? ['left', 'both'] : ['right', 'both']).includes(pose)) continue;
      const pivot = left ? 7 : 24, angle = left ? 2.2 : -2.2;
      for (let y = -8; y <= 29; y++) for (let x = -8; x < 40; x++) {
        const sx = Math.round(pivot + (x - pivot) * Math.cos(angle) + (y - 13) * Math.sin(angle));
        const sy = Math.round(13 - (x - pivot) * Math.sin(angle) + (y - 13) * Math.cos(angle));
        if (sy < 11 || sy > 29 || sx < 0 || sx >= 32 || !(left ? sx < 8 : sx > 23)) continue;
        const pixel = SPRITE[sy][sx];
        if (pixel !== '.') pixels.set(`${x},${y}`, [x, y, pixel]);
      }
    }
    const points = Array.from(pixels.values()); poses.set(pose, points); return points;
  }
  function drawGorilla(ctx, x, y, player, pose = 'idle', bounce = 0) {
    const palette = FUR[player];
    for (const [px, py, pixel] of posePixels(pose)) {
      ctx.fillStyle = palette[pixel];
      ctx.fillRect(Math.round(x - 16 + px), Math.round(y + py - bounce), 1, 1);
    }
  }
  function pixelDisc(ctx, x, y, radius, color) {
    ctx.fillStyle = color;
    for (let dy = -radius; dy <= radius; dy += 2) {
      const dx = Math.sqrt(Math.max(0, radius * radius - dy * dy));
      ctx.fillRect(Math.round((x - dx) / 2) * 2, Math.round((y + dy) / 2) * 2, Math.max(2, Math.round(dx) * 2), 2);
    }
  }
  function drawExplosion(ctx, hit, wind = 0, reducedMotion = false) {
    const t = hit.age, big = hit.type === 'gorilla', size = hit.radius ? hit.radius / 11 : big ? 1.5 : 1;
    if (t > 1.8) return;
    ctx.save();
    if (reducedMotion) {
      ctx.globalAlpha = Math.max(0, 1 - t / .8) * .7;
      pixelDisc(ctx, hit.x, hit.y, 12 * size, '#e48d4d'); ctx.restore(); return;
    }
    // Smoke expands, rises and drifts downwind; it outlives the short fireball.
    for (let i = 0; i < 7; i++) {
      const angle = i * 2.399, spread = (5 + t * 12) * size;
      ctx.globalAlpha = Math.min(.32, t * 2) * Math.max(0, 1 - t / 1.8);
      const x = hit.x + Math.cos(angle) * spread + wind * t * 1.7;
      const y = hit.y + Math.sin(angle) * spread * .45 - t * (17 + i * 2);
      pixelDisc(ctx, x, y, (5 + t * 9) * size, i % 2 ? '#70655c' : '#454a46');
    }
    if (t < .5) {
      const expansion = Math.sin(Math.min(1, t / .24) * Math.PI / 2);
      ctx.globalAlpha = Math.max(0, 1 - t / .5);
      for (let i = 0; i < 6; i++) {
        const angle = i * 2.399;
        pixelDisc(ctx, hit.x + Math.cos(angle) * 9 * expansion * size, hit.y + Math.sin(angle) * 7 * expansion * size,
          (4 + expansion * 10) * size, hit.charged ? (i % 2 ? '#f7b547' : '#ffe49a') : i % 2 ? '#ed672f' : '#f5a43d');
      }
      pixelDisc(ctx, hit.x, hit.y - t * 10, Math.max(1, 10 * (1 - t / .5)) * size, '#ffe5a0');
    }
    // Hot sparks fade; chunks of masonry follow ballistic paths and fall.
    for (let i = 0; i < (big ? 24 : 16); i++) {
      const angle = i * 2.399 + .4, speed = (28 + (i * 37 % 65)) * size;
      const x = hit.x + Math.cos(angle) * speed * t + wind * t * t;
      const y = hit.y + Math.sin(angle) * speed * t - 20 * t + 65 * t * t;
      ctx.globalAlpha = Math.max(0, 1 - t / (i % 3 === 0 ? .65 : 1.25));
      ctx.fillStyle = i % 3 === 0 ? '#ffcf72' : i % 2 ? '#71655b' : '#424e4c';
      const side = i % 3 === 0 ? 2 : 3;
      ctx.fillRect(Math.round(x), Math.round(y), side, side);
    }
    ctx.restore();
  }
  function drawBanana(ctx, x, y, rotation = 0) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.fillStyle = '#8c6134';
    ctx.beginPath(); ctx.moveTo(-16, -10); ctx.bezierCurveTo(-14, 17, 13, 21, 19, -7);
    ctx.bezierCurveTo(9, 5, -3, 8, -16, -10); ctx.fill();
    ctx.fillStyle = '#ffdc62';
    ctx.beginPath(); ctx.moveTo(-14, -8); ctx.bezierCurveTo(-11, 15, 12, 18, 17, -4);
    ctx.bezierCurveTo(7, 8, -4, 9, -14, -8); ctx.fill();
    ctx.strokeStyle = '#fff0a2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, 3); ctx.quadraticCurveTo(2, 16, 12, 5); ctx.stroke();
    ctx.fillStyle = '#665139'; ctx.fillRect(-17, -14, 4, 7); ctx.fillRect(17, -9, 3, 4);
    ctx.restore();
  }
  root.GorillaVisuals = { drawGorilla, drawExplosion, drawBanana };
})(globalThis);
