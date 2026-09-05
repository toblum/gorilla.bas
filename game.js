/* Canvas presentation and accessible HTML controls. No network dependencies. */
(() => {
  'use strict';
  const { Game, WIDTH, HEIGHT, FLOOR, SPRITE } = window.Gorillas;
  const game = new Game();
  const sound = new window.GorillaSound();
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const city = document.createElement('canvas'); city.width = WIDTH; city.height = HEIGHT;
  const cityCtx = city.getContext('2d');
  const palette = [ ['#667b78', '#81918a'], ['#b78377', '#c69583'], ['#797986', '#94909a'], ['#445e64', '#60787c'] ];
  const colors = ['#f3854e', '#b9d4b6'];
  let drawnRound = 0, drawnTerrain = -1, previousPhase = '', previousTime = 0, uiDirty = true;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildCity() {
    cityCtx.clearRect(0, 0, WIDTH, HEIGHT);
    for (const b of game.buildings) {
      cityCtx.fillStyle = palette[b.color][0]; cityCtx.fillRect(b.x, b.y, b.width, b.height);
      cityCtx.fillStyle = palette[b.color][1]; cityCtx.fillRect(b.x, b.y, b.width, 3); cityCtx.fillRect(b.x, b.y, 2, b.height);
      cityCtx.fillStyle = '#283f4438'; cityCtx.fillRect(b.x + b.width - 5, b.y + 3, 5, b.height - 3);
      for (const w of b.windows) {
        cityCtx.fillStyle = w.lit ? '#e5c89a' : '#293f4c70'; cityCtx.fillRect(w.x, w.y, 4, 7);
        if (w.lit) { cityCtx.fillStyle = '#f7dcb0'; cityCtx.fillRect(w.x, w.y, 4, 2); }
      }
    }
    drawnRound = game.round; drawnTerrain = 0;
  }
  function updateCity() {
    if (drawnRound !== game.round || drawnTerrain < 0) buildCity();
    if (drawnTerrain !== game.craters.length) {
      // Use the exact physics mask so visible holes and passable terrain agree pixel for pixel.
      const image = cityCtx.getImageData(0, 0, WIDTH, HEIGHT);
      for (let i = 0; i < game.terrain.length; i++) if (!game.terrain[i]) image.data[i * 4 + 3] = 0;
      cityCtx.putImageData(image, 0, 0); drawnTerrain = game.craters.length;
    }
  }
  function sun() {
    const x = WIDTH / 2, y = 61;
    ctx.fillStyle = '#f9dc93';
    for (let a = 0; a < 12; a++) {
      const theta = a * Math.PI / 6;
      ctx.fillRect(Math.round(x + Math.cos(theta) * 30) - 2, Math.round(y + Math.sin(theta) * 30) - 2, 4, 4);
    }
    ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#855e52'; ctx.fillRect(x - 9, y - 5, 3, 4); ctx.fillRect(x + 6, y - 5, 3, 4);
    if (game.sunHit) { ctx.fillRect(x - 3, y + 4, 6, 7); }
    else { ctx.fillRect(x - 8, y + 6, 3, 3); ctx.fillRect(x + 5, y + 6, 3, 3); ctx.fillRect(x - 5, y + 9, 10, 3); }
  }
  function gorilla(g, player, time) {
    if (!g.alive) return;
    const celebrating = game.winner === player;
    const lift = !reducedMotion && celebrating ? Math.floor(time / 180) % 2 : -1;
    for (let row = 0; row < SPRITE.length; row++) for (let col = 0; col < 16; col++) {
      const pixel = SPRITE[row][col]; if (pixel === '.') continue;
      ctx.fillStyle = pixel === 'e' ? '#273b3e' : pixel === 'f' ? (player === 0 ? '#c26040' : '#7e9e89') : colors[player];
      const armLift = ((lift === 0 && col < 3) || (lift === 1 && col > 12)) && row > 6 && row < 13 ? 13 : 0;
      ctx.fillRect(g.x - 16 + col * 2, g.y + row * 2 - armLift, 2, 2);
    }
    if (game.phase === 'aiming' && game.turn === player) {
      const y = g.y - 17 + (reducedMotion ? 0 : Math.round(Math.sin(time / 240) * 2));
      ctx.fillStyle = colors[player]; ctx.fillRect(g.x - 5, y, 10, 2); ctx.fillRect(g.x - 3, y + 2, 6, 2); ctx.fillRect(g.x - 1, y + 4, 2, 2);
    }
  }
  function banana(shot) {
    if (shot.y < 0) {
      ctx.fillStyle = '#514e43'; ctx.font = '10px "Courier New"'; ctx.textAlign = 'center';
      ctx.fillText('↑ BANANE', Math.max(40, Math.min(WIDTH - 40, shot.x)), 16); return;
    }
    for (let i = 0; i < shot.trail.length; i++) {
      ctx.fillStyle = `rgba(255,241,185,${i / shot.trail.length * .45})`;
      ctx.fillRect(Math.round(shot.trail[i].x), Math.round(shot.trail[i].y), 2, 2);
    }
    ctx.save(); ctx.translate(Math.round(shot.x), Math.round(shot.y)); ctx.rotate(Math.floor(shot.time * 10) * Math.PI / 2);
    ctx.fillStyle = '#554b32'; ctx.fillRect(-5, -5, 3, 5);
    ctx.fillStyle = '#ffe181'; ctx.fillRect(-5, -2, 3, 5); ctx.fillRect(-3, 2, 6, 3); ctx.fillRect(3, -2, 3, 5); ctx.fillRect(4, -5, 2, 4);
    ctx.restore();
  }
  function draw(time) {
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#eeb59a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = '#e8a38d'; ctx.fillRect(0, 142, WIDTH, 104);
    ctx.fillStyle = '#db9485'; ctx.fillRect(0, 246, WIDTH, 174);
    // Quiet, non-interactive skyline sits behind the playfield.
    ctx.fillStyle = '#b58e87';
    for (let i = 0; i < 23; i++) {
      const h = 38 + ((i * 43 + 17) % 92); ctx.fillRect(i * 39 - 10, FLOOR - h, 30, h);
    }
    sun(); updateCity(); ctx.drawImage(city, 0, 0);
    ctx.fillStyle = '#293f47'; ctx.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
    ctx.fillStyle = '#9ba99d'; ctx.fillRect(0, FLOOR + 1, WIDTH, 1);
    game.gorillas.forEach((g, player) => gorilla(g, player, time));
    if (game.shot && game.phase === 'flying') banana(game.shot);
    if (game.phase === 'impact') {
      const hit = game.impact, duration = game.winner !== null ? 1 : .45;
      const progress = hit.age / duration, radius = (game.winner !== null ? 30 : 16) * Math.sin(progress * Math.PI);
      ctx.fillStyle = progress < .45 ? '#fff0b0' : '#f2764c';
      ctx.beginPath(); ctx.arc(hit.x, hit.y, Math.max(0, radius), 0, Math.PI * 2); ctx.fill();
      if (!reducedMotion) for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4, distance = progress * 42;
        ctx.fillRect(Math.round(hit.x + Math.cos(a) * distance), Math.round(hit.y + Math.sin(a) * distance + progress * progress * 20), 3, 3);
      }
    }
  }
  function syncUI(focus = false) {
    const aiming = game.phase === 'aiming', ended = ['roundOver', 'matchOver'].includes(game.phase);
    for (let p = 0; p < 2; p++) {
      $(`name-${p}`).textContent = game.options.names[p]; $(`score-${p}`).textContent = game.scores[p];
      $(`player-${p}`).classList.toggle('active', !ended && p === game.turn);
      $(`state-${p}`).textContent = ended ? (game.winner === p ? 'GEWONNEN' : 'GETROFFEN') : p === game.turn ? (aiming ? 'AM WURF' : 'WIRFT') : 'WARTET';
    }
    $('round').textContent = `RUNDE ${String(game.round).padStart(2, '0')}`;
    $('target-label').textContent = `ZUERST ${game.options.target} ${game.options.target === 1 ? 'PUNKT' : 'PUNKTE'}`;
    $('wind-label').textContent = game.wind === 0 ? 'WINDSTILLE' : `WIND ${Math.abs(game.wind)}`;
    $('wind').setAttribute('aria-label', `Wind: ${Math.abs(game.wind)}, ${game.wind < 0 ? 'nach links' : game.wind > 0 ? 'nach rechts' : 'windstill'}`);
    const tip = 70 + game.wind * 4, head = tip - Math.sign(game.wind) * 3;
    $('wind-arrow').setAttribute('d', game.wind === 0 ? '' : `M70 8H${tip}M${head} 5L${tip} 8L${head} 11`);
    $('gravity-label').textContent = `g ${game.options.gravity.toLocaleString('de-DE')} m/s²`;
    for (const id of ['angle', 'power', 'throw']) $(id).disabled = !aiming;
    $('result').hidden = !ended;
    $('turn-label').textContent = ended ? (game.phase === 'matchOver' ? 'MATCH ENTSCHIEDEN' : 'RUNDE ENTSCHIEDEN') : `${game.options.names[game.turn].toLocaleUpperCase('de-DE')} ${aiming ? 'IST DRAN' : 'WIRFT'}`;
    if (aiming) {
      const last = game.lastShots[game.turn];
      $('angle').value = last?.angle ?? 45; $('power').value = last?.power ?? 65;
      $('last-shot').textContent = last ? `Dein letzter Wurf: ${last.angle}° / Stärke ${last.power}` : 'Dein erster Wurf wartet.';
      $('message').textContent = game.lastEvent === 'building' ? 'Nur Beton erwischt. Der nächste Versuch zählt.' : game.lastEvent === 'miss' ? 'Vorbei! Jetzt bist du am Zug.' : 'Die Stadt gehört euch. Legt los!';
      if (focus && !$('settings').open) { $('angle').focus({ preventScroll: true }); $('angle').select(); }
    } else if (ended) {
      const name = game.options.names[game.winner], matchOver = game.phase === 'matchOver';
      $('result-eyebrow').textContent = matchOver ? 'DIE DÄCHER HABEN EINEN CHAMPION' : 'VOLLTREFFER';
      $('result-title').textContent = matchOver ? `${name} gewinnt!` : `Punkt für ${name}!`;
      const selfHit = game.impact.player === 1 - game.turn;
      $('result-description').textContent = `${selfHit ? 'Oh nein, ein Selbsttreffer! ' : ''}${matchOver ? `Endstand ${game.scores[0]} : ${game.scores[1]}. Zeit für eine Revanche?` : 'Neue Skyline, neuer Wind. Auf in die nächste Runde.'}`;
      $('continue').textContent = matchOver ? 'Revanche spielen →' : 'Nächste Runde →';
      $('message').textContent = $('result-title').textContent;
      if (!$('settings').open) $('continue').focus({ preventScroll: true });
    } else {
      $('message').textContent = game.phase === 'impact' ? (game.winner !== null ? 'Treffer! Das gibt einen Punkt.' : 'Die Fassade hat jetzt ein Fenster mehr.') : 'Banane unterwegs …';
    }
    uiDirty = false;
  }
  $('shot-form').addEventListener('submit', event => {
    event.preventDefault();
    if ($('settings').open || !$('shot-form').checkValidity()) return;
    if (game.fire(Number($('angle').value), Number($('power').value))) { sound.play('throw'); uiDirty = true; syncUI(); }
  });
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || $('settings').open) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, select, textarea, [contenteditable="true"]')) return;
    if (target instanceof HTMLInputElement && !['angle', 'power'].includes(target.id)) return;
    const arrows = { ArrowUp: ['angle', 1], ArrowDown: ['angle', -1], ArrowRight: ['power', 1], ArrowLeft: ['power', -1] };
    if (!arrows[event.key] && event.code !== 'Space') return;
    event.preventDefault();
    if (game.phase !== 'aiming') return;
    if (event.code === 'Space') {
      if (!event.repeat) $('shot-form').requestSubmit();
    } else {
      const [id, direction] = arrows[event.key], input = $(id);
      const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      input.value = Math.max(0, Math.min(360, value + direction * (event.shiftKey ? 5 : 1)));
      input.focus({ preventScroll: true }); input.select();
    }
  });
  $('sound-toggle').addEventListener('click', () => {
    sound.setEnabled(!sound.enabled);
    $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled));
    $('sound-label').textContent = sound.enabled ? 'Ton an' : 'Ton aus';
    if (sound.enabled) sound.play('round');
  });
  $('continue').addEventListener('click', () => {
    sound.stop();
    if (game.continue()) { drawnTerrain = -1; syncUI(true); }
  });
  $('settings-open').addEventListener('click', () => {
    sound.stop();
    for (let i = 0; i < 2; i++) $(`setting-name-${i}`).value = game.options.names[i];
    $('setting-target').value = game.options.target; $('setting-gravity').value = game.options.gravity;
    $('settings').showModal();
  });
  $('settings-close').addEventListener('click', () => $('settings').close());
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    sound.stop();
    game.reset({ names: [$('setting-name-0').value, $('setting-name-1').value], target: Number($('setting-target').value), gravity: Number($('setting-gravity').value) });
    $('settings').close(); drawnTerrain = -1; syncUI(true);
  });
  function frame(time) {
    const dt = previousTime ? Math.min((time - previousTime) / 1000, .05) : 0; previousTime = time;
    if (!$('settings').open && !document.hidden) game.update(dt);
    if (previousPhase !== game.phase || uiDirty) {
      if (previousPhase !== game.phase) {
        if (game.phase === 'impact') sound.play(game.impact.type);
        else if (game.phase === 'roundOver') sound.play('round');
        else if (game.phase === 'matchOver') sound.play('match');
        else if (game.phase === 'aiming' && previousPhase === 'flying' && game.lastEvent === 'miss') sound.play('miss');
      }
      syncUI(previousPhase !== '' && game.phase === 'aiming'); previousPhase = game.phase;
    }
    draw(time); requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', () => { previousTime = 0; if (document.hidden) sound.stop(); });
  syncUI(); requestAnimationFrame(frame);
})();
