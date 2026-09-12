/* Canvas presentation and accessible HTML controls. No network dependencies. */
(() => {
  'use strict';
  const { Game, WIDTH, HEIGHT, FLOOR, launchVector } = window.Gorillas;
  const { drawGorilla, drawExplosion, drawBanana } = window.GorillaVisuals;
  let game = new Game(), mode = '2d', renderer3d = null, rendererError = '', renderBlocked = false;
  const sound = new window.GorillaSound();
  const scenery = new window.GorillaScenery();
  const $ = id => document.getElementById(id);
  const classic = new window.ClassicUI(sound, () => { started = false; populateSettings(); $('settings-close').hidden = true; $('settings').showModal(); saveSession(); });
  $('classic-intro').addEventListener('click', () => classic.advance('v'));
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const city = document.createElement('canvas'); city.width = WIDTH; city.height = HEIGHT;
  const cityCtx = city.getContext('2d');
  const palette = [ ['#667b78', '#81918a'], ['#b78377', '#c69583'], ['#797986', '#94909a'], ['#445e64', '#60787c'] ];
  const colors = ['#f3854e', '#b9d4b6'];
  let drawnRound = 0, drawnTerrain = -1, previousPhase = '', previousTime = 0, uiDirty = true, ambientTimer = 3.5;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sessionKey = 'gorillas-session-v1';
  let started = false, savedInputs = null, savedCamera = null, saveTimer = 0, finale = null, savedFinaleAge = 0, sceneryTime = 0;
  try {
    const saved = JSON.parse(sessionStorage.getItem(sessionKey));
    const candidate = saved?.mode === '3d' ? new window.Gorillas3D.Game3D() : new Game();
    if (saved?.mode === 'classic' && saved.classicOptions) {
      const original = new window.GorillasClassic.ClassicGame(saved.classicOptions);
      game.options = { ...game.options, ...original.options }; mode = 'classic';
      sound.enabled = saved.sound !== false;
    } else if (saved && candidate.restore(saved.game)) {
      game = candidate; mode = saved.mode === 'classic' ? 'classic' : saved.mode === '3d' ? '3d' : '2d';
      started = mode !== 'classic' && saved.screen !== 'welcome'; savedInputs = saved.inputs; savedFinaleAge = saved.finaleAge || 0;
      sound.enabled = saved.sound !== false;
      savedCamera = saved.camera;
    }
  } catch { /* Storage may be unavailable or an older save invalid. */ }
  function saveSession() {
    try { sessionStorage.setItem(sessionKey, JSON.stringify({ mode, classicOptions: mode === 'classic' ? game.options : undefined, game: game.snapshot(), inputs: [$('angle').value, $('power').value, $('direction').value], camera: mode === '3d' ? renderer3d?.camera.snapshot() : null, sound: sound.enabled, screen: started ? 'game' : 'welcome', finaleAge: finale?.age || 0 })); } catch { /* Playing also works without storage. */ }
  }
  function populateSettings() {
    for (let i = 0; i < 2; i++) $(`setting-name-${i}`).value = game.options.names[i];
    $('setting-target').value = game.options.target; $('setting-gravity').value = game.options.gravity;
    $('setting-aim-assist').checked = game.options.aimAssist;
    $('setting-replay').checked = game.options.replay !== false;
    $(`mode-${mode}`).checked = true; updateModeDescription();
  }
  function updateModeDescription() {
    const original = $('mode-classic').checked;
    $('setting-aim-assist').closest('label').hidden = original;
    $('setting-target-label').textContent = original ? 'Runden insgesamt' : 'Gewonnene Runden zum Sieg';
    for (const id of ['setting-name-0', 'setting-name-1']) $(id).maxLength = original ? 10 : 18;
    $('setting-gravity').min = original ? '0.000001' : '0.5';
    $('setting-gravity').max = original ? '' : '30';
    $('setting-gravity').step = original ? 'any' : '0.1';
    if (!original && !$('setting-gravity').checkValidity()) $('setting-gravity').value = 9.8;
    $('settings-note').textContent = original ? 'Originalregeln: feste Rundenzahl, Namen bis 10 Zeichen, beliebige positive Gravitation. Winkel und Stärke werden nacheinander mit Enter bestätigt.' : 'Ein Treffer gewinnt die Runde. Gravitation: Erde 9,8 · Mond 1,6. Sonnenkontakt lädt die Banane auf: 20 % mehr Explosionsradius. Ein neues Match beginnt bei 0 : 0.';
    $('replay-option').hidden = !$('mode-3d').checked;
    $('mode-description').textContent = original ? 'Classic: QBasic Gorillas von 1990. Originale EGA-Pixel, ursprüngliche Spielregeln und PC-Lautsprecher-Melodien.' : $('mode-3d').checked ? rendererError || 'Winkel, Richtung, Stärke: Werft durch eine räumliche Stadt. Kamera drehen, Straßen erkunden, Dächer treffen.' : 'Das Originalgefühl: Winkel und Stärke bestimmen euren Wurf.';
  }
  function ensure3D() {
    try {
      if (renderer3d?.lost) throw new Error('Die 3D-Grafik wurde unterbrochen. Bitte lade die Seite neu oder wähle 2D.');
      if (!renderer3d) renderer3d = new window.GorillaCity3D($('game3d'), $('hud3d'));
      if (savedCamera) { renderer3d.camera.restore(savedCamera); savedCamera = null; }
      rendererError = ''; return true;
    }
    catch (error) { rendererError = error.message; $('mode-description').textContent = rendererError; return false; }
  }
  function applyMode() {
    const spatial = mode === '3d';
    document.body.classList.toggle('mode-3d', spatial);
    document.body.classList.toggle('mode-classic', mode === 'classic');
    $('classic-game').hidden = $('classic-controls').hidden = mode !== 'classic';
    for (const id of ['game3d', 'hud3d', 'view-tools', 'direction-field', 'direction-help']) $(id).hidden = !spatial;
    $('game').hidden = spatial || mode === 'classic'; $('direction').disabled = !spatial;
    $('game').setAttribute('aria-label', 'Zwei Gorillas auf Hochhäusern. Winkel und Stärke bestimmen den Wurf.');
  }
  for (const id of ['mode-2d', 'mode-3d', 'mode-classic']) $(id).addEventListener('change', updateModeDescription);
  $('camera-overview').addEventListener('click', () => renderer3d?.resetCamera());
  $('camera-player').addEventListener('click', () => renderer3d?.playerCamera(game));
  $('camera-in').addEventListener('click', () => renderer3d?.zoom(.85));
  $('camera-out').addEventListener('click', () => renderer3d?.zoom(1.15));
  function returnToWelcome() {
    sound.stop(); $('finale').close(); finale = null; savedFinaleAge = 0;
    started = false; game.reset(); drawnTerrain = -1; previousPhase = game.phase;
    populateSettings(); $('settings-close').hidden = true; $('settings').showModal(); syncUI(); saveSession();
  }
  function startFinale() {
    if (finale || !started || renderBlocked) return;
    $('finale-title').textContent = `${game.options.names[game.winner]} hebt ab!`;
    $('finale-score').textContent = `MATCH GEWONNEN · ${game.scores[0]} : ${game.scores[1]}`;
    finale = new window.GorillaFinale(returnToWelcome, savedFinaleAge);
    sound.stop(); sound.play('finale', finale.age);
    $('finale').showModal(); $('finale-skip').focus({ preventScroll: true });
  }

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
  function updateAmbientLights(dt) {
    if (mode === '3d' || reducedMotion || dt <= 0) return;
    ambientTimer -= dt;
    if (ambientTimer > 0) return;
    ambientTimer = 3.5 + Math.random() * 3.5;
    const candidates = game.buildings.flatMap(b => b.windows.filter(w => game.terrain[(w.y + 3) * WIDTH + w.x + 2]));
    if (!candidates.length) return;
    const window = candidates[Math.floor(Math.random() * candidates.length)];
    window.lit = !window.lit;
    drawnTerrain = -1;
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
    const celebrating = game.winner === player && game.phase !== 'impact';
    const pose = celebrating ? (reducedMotion ? 'both' : ['left', 'both', 'right', 'both'][Math.floor(time / 220) % 4]) : 'idle';
    const bounce = celebrating && !reducedMotion ? Math.abs(Math.sin(time / 140)) * 3 : 0;
    drawGorilla(ctx, g.x, g.y, player, pose, bounce);
    if (game.phase === 'aiming' && game.turn === player) {
      const y = g.y - 17 + (reducedMotion ? 0 : Math.round(Math.sin(time / 240) * 2));
      ctx.fillStyle = colors[player]; ctx.fillRect(g.x - 5, y, 10, 2); ctx.fillRect(g.x - 3, y + 2, 6, 2); ctx.fillRect(g.x - 1, y + 4, 2, 2);
    }
  }
  function banana(shot) {
    if (shot.y < 0) {
      ctx.fillStyle = '#2f2a27'; ctx.font = '13px "Courier New"'; ctx.textAlign = 'center';
      ctx.fillText(shot.charged ? '↑ SONNENBANANE' : '↑ BANANE', Math.max(65, Math.min(WIDTH - 65, shot.x)), 16); return;
    }
    if (shot.charged) {
      ctx.save(); ctx.globalAlpha = .32; ctx.fillStyle = '#fff0ac';
      ctx.beginPath(); ctx.arc(shot.x, shot.y, 10, 0, Math.PI * 2); ctx.fill(); ctx.restore();
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
  function aimArrow() {
    if (!game.options.aimAssist || game.phase !== 'aiming') return;
    const angle = $('angle').valueAsNumber, power = $('power').valueAsNumber;
    if (!Number.isFinite(angle) || !Number.isFinite(power) || power <= 0 || power > 360 || angle < 0 || angle > 360) return;
    const { vx, vy } = launchVector(game.turn, angle, 1), g = game.gorillas[game.turn];
    const length = 14 + power * .23;
    // Start at the torso center and draw before the actor so the guide sits behind him.
    const x = g.x, y = g.y + 16;
    const endX = x + vx * length, endY = y - vy * length;
    ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY);
    ctx.moveTo(endX - vx * 6 - vy * 4, endY + vy * 6 - vx * 4); ctx.lineTo(endX, endY);
    ctx.lineTo(endX - vx * 6 + vy * 4, endY + vy * 6 + vx * 4);
    ctx.strokeStyle = '#fff4d525'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#394d554d'; ctx.lineWidth = 2.5; ctx.stroke(); ctx.restore();
  }
  function draw(time) {
    if (mode === '3d') {
      renderer3d?.draw(game, time, { angle: $('angle').valueAsNumber, power: $('power').valueAsNumber, direction: $('direction').valueAsNumber }, reducedMotion, $('settings').open || document.hidden || Boolean(finale));
    } else if (mode !== 'classic') {
    ctx.imageSmoothingEnabled = false;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#a6b4bc'); sky.addColorStop(.28, '#eab69f'); sky.addColorStop(.66, '#efa58b'); sky.addColorStop(1, '#c98482');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const drift = reducedMotion ? 0 : sceneryTime / 1800;
    // A barely perceptible warm haze breathes over a forty-second cycle.
    ctx.fillStyle = `rgba(255,221,166,${reducedMotion ? .035 : .035 + Math.sin(sceneryTime / 7000) * .015})`;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 6; i++) {
      const x = ((i * 157 + drift * (i % 2 ? .6 : 1)) % (WIDTH + 140)) - 90, y = 32 + (i * 37) % 110;
      ctx.fillStyle = '#ffe4cb55'; ctx.fillRect(Math.round(x), y, 80 + i * 7, 5);
      ctx.fillRect(Math.round(x + 17), y - 5, 46 + i * 4, 5);
      ctx.fillStyle = '#fff1d52b'; ctx.fillRect(Math.round(x - 24), y + 5, 132, 3);
    }
    scenery.draw(ctx);
    // Quiet, non-interactive skyline sits behind the playfield.
    ctx.fillStyle = '#b58e87';
    for (let i = 0; i < 23; i++) {
      const h = 38 + ((i * 43 + 17) % 92); ctx.fillRect(i * 39 - 10, FLOOR - h, 30, h);
    }
    sun(); updateCity(); ctx.drawImage(city, 0, 0);
    ctx.fillStyle = '#293f47'; ctx.fillRect(0, FLOOR, WIDTH, HEIGHT - FLOOR);
    ctx.fillStyle = '#9ba99d'; ctx.fillRect(0, FLOOR + 1, WIDTH, 1);
    aimArrow();
    game.gorillas.forEach((g, player) => gorilla(g, player, time));
    if (game.shot && game.phase === 'flying') banana(game.shot);
    if (game.impact) drawExplosion(ctx, game.impact, game.wind, reducedMotion);
    }
    if (!$('result').hidden && game.winner !== null) {
      const portrait = $('winner-portrait').getContext('2d');
      portrait.clearRect(0, 0, 144, 144); portrait.save(); portrait.scale(3, 3);
      const pose = reducedMotion ? 'both' : ['left', 'both', 'right', 'both'][Math.floor(time / 220) % 4];
      drawGorilla(portrait, 24, 9, game.winner, pose); portrait.restore();
    }
    if ($('settings').open) {
      const preview = $('welcome-art').getContext('2d');
      preview.clearRect(0, 0, 400, 230);
      preview.fillStyle = '#ebae90'; preview.fillRect(0, 0, 400, 230);
      preview.fillStyle = '#ffdf96'; preview.beginPath(); preview.arc(205, 72, 34, 0, Math.PI * 2); preview.fill();
      for (let i = 0; i < 9; i++) {
        const h = 35 + (i * 37) % 65;
        preview.fillStyle = i % 2 ? '#677c79' : '#405b62'; preview.fillRect(i * 49 - 12, 230 - h, 45, h);
        preview.fillStyle = '#f3d3a0';
        for (let x = 0; x < 3; x++) for (let y = 0; y < h - 15; y += 14) preview.fillRect(i * 49 - 5 + x * 11, 240 - h + y, 3, 5);
      }
      preview.fillStyle = '#283e46'; preview.fillRect(28, 169, 96, 61); preview.fillRect(276, 169, 96, 61);
      preview.save(); preview.scale(2, 2);
      const pose = reducedMotion ? 'both' : ['left', 'both', 'right', 'both'][Math.floor(time / 350) % 4];
      drawGorilla(preview, 38, 50, 0, pose); drawGorilla(preview, 162, 50, 1, pose); preview.restore();
      const flight = sceneryTime / 3400, turn = Math.floor(flight), t = reducedMotion ? .5 : flight % 1;
      const direction = turn % 2 ? -1 : 1;
      const progress = direction === 1 ? t : 1 - t;
      preview.save(); preview.globalAlpha = reducedMotion ? 1 : Math.min(1, t * 12, (1 - t) * 12);
      drawBanana(preview, 80 + 240 * progress, 91 - Math.sin(t * Math.PI) * 64, reducedMotion ? -.3 : direction * (t * Math.PI * 2 - .6));
      preview.restore();
    }
  }
  function syncUI(focus = false) {
    if (mode === 'classic') { $('result').hidden = true; uiDirty = false; return; }
    const aiming = game.phase === 'aiming', celebrating = game.phase === 'celebrating';
    const ended = celebrating || ['roundOver', 'matchOver'].includes(game.phase);
    for (let p = 0; p < 2; p++) {
      $(`name-${p}`).textContent = game.options.names[p]; $(`score-${p}`).textContent = game.scores[p];
      $(`player-${p}`).classList.toggle('active', !ended && p === game.turn);
      $(`state-${p}`).textContent = ended ? (game.winner === p ? 'GEWONNEN' : 'GETROFFEN') : p === game.turn ? (aiming ? 'AM WURF' : 'WIRFT') : 'WARTET';
    }
    $('round').textContent = `RUNDE ${String(game.round).padStart(2, '0')}`;
    $('target-label').textContent = `ZUERST ${game.options.target} ${game.options.target === 1 ? 'PUNKT' : 'PUNKTE'}`;
    $('wind-label').textContent = mode === '3d' ? `WIND O ${game.wind > 0 ? '+' : ''}${game.wind} · S ${game.windZ > 0 ? '+' : ''}${game.windZ}` : game.wind === 0 ? 'WINDSTILLE' : `WIND ${Math.abs(game.wind)}`;
    $('wind').setAttribute('aria-label', `Wind: ${Math.abs(game.wind)}, ${game.wind < 0 ? 'nach links' : game.wind > 0 ? 'nach rechts' : 'windstill'}`);
    if (mode === '3d') $('wind').setAttribute('aria-label', `Wind: ${game.wind} Richtung Osten, ${game.windZ} Richtung Süden; negative Werte zeigen in die Gegenrichtung.`);
    const tip = 70 + game.wind * 4, head = tip - Math.sign(game.wind) * 3;
    $('wind-arrow').setAttribute('d', game.wind === 0 ? '' : `M70 8H${tip}M${head} 5L${tip} 8L${head} 11`);
    $('gravity-label').textContent = `g ${game.options.gravity.toLocaleString('de-DE')} m/s²`;
    for (const id of ['angle', 'power', 'throw']) $(id).disabled = !aiming;
    $('direction').disabled = !aiming || mode !== '3d';
    $('result').hidden = !ended || celebrating || game.phase === 'matchOver';
    $('turn-label').textContent = ended ? (game.phase === 'matchOver' ? 'MATCH ENTSCHIEDEN' : 'RUNDE ENTSCHIEDEN') : `${game.options.names[game.turn].toLocaleUpperCase('de-DE')} ${aiming ? 'IST DRAN' : 'WIRFT'}`;
    if (aiming) {
      const last = game.lastShots[game.turn];
      // New matches and untouched turns use a neutral horizontal direction.
      $('angle').value = last?.angle ?? 45; $('power').value = last?.power ?? 65; $('direction').value = last?.direction ?? 0;
      $('last-shot').textContent = last ? `Dein letzter Wurf: ${last.angle}° / ${mode === '3d' ? `Richtung ${last.direction}° / ` : ''}Stärke ${last.power}` : 'Dein erster Wurf wartet.';
      $('message').textContent = game.lastEvent === 'building' ? 'Nur Beton erwischt. Der nächste Versuch zählt.' : game.lastEvent === 'miss' ? 'Vorbei! Jetzt bist du am Zug.' : 'Die Stadt gehört euch. Legt los!';
      if (focus && !$('settings').open) { $('angle').focus({ preventScroll: true }); $('angle').select(); }
    } else if (ended) {
      const name = game.options.names[game.winner], matchOver = game.phase === 'matchOver';
      $('result-eyebrow').textContent = matchOver ? 'DIE DÄCHER HABEN EINEN CHAMPION' : 'VOLLTREFFER';
      $('result-title').textContent = matchOver ? `${name} gewinnt!` : `Punkt für ${name}!`;
      const selfHit = game.impact.player === 1 - game.turn;
      $('result-description').textContent = `${selfHit ? 'Oh nein, ein Selbsttreffer! ' : ''}${matchOver ? `Endstand ${game.scores[0]} : ${game.scores[1]}. Zeit für eine Revanche?` : 'Neue Skyline, neuer Wind. Auf in die nächste Runde.'}`;
      $('continue').textContent = matchOver ? 'Revanche spielen →' : 'Nächste Runde →';
      $('message').textContent = celebrating ? `${name} feiert seinen Treffer!` : $('result-title').textContent;
      $('winner-portrait').setAttribute('aria-label', `${name} jubelt mit erhobenen Armen`);
      if (!celebrating && game.phase !== 'matchOver' && !$('settings').open) $('continue').focus({ preventScroll: true });
      if (game.phase === 'matchOver' && (mode !== '3d' || !renderer3d?.replay)) startFinale();
    } else {
      $('message').textContent = game.phase === 'impact' ? (game.winner !== null ? 'Treffer! Das gibt einen Punkt.' : 'Die Fassade hat jetzt ein Fenster mehr.') : game.shot?.charged ? 'Sonnenladung! Diese Banane hat jetzt mehr Wumms.' : 'Banane unterwegs …';
    }
    uiDirty = false;
  }
  $('shot-form').addEventListener('submit', event => {
    event.preventDefault();
    if (mode === 'classic' || $('settings').open || !$('shot-form').checkValidity()) return;
    if (game.fire(Number($('angle').value), Number($('power').value), Number($('direction').value))) { renderer3d?.closeReplay(); sound.play('throw'); uiDirty = true; syncUI(); }
  });
  document.addEventListener('keydown', event => {
    if (mode === 'classic' || event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || $('settings').open) return;
    const target = event.target;
    if (target instanceof Element && target.closest('button, a, select, textarea, [contenteditable="true"]')) return;
    if (target instanceof HTMLInputElement && !['angle', 'power', 'direction'].includes(target.id)) return;
    const arrows = { ArrowUp: ['angle', 1], ArrowDown: ['angle', -1], ArrowRight: ['power', 1], ArrowLeft: ['power', -1] };
    if (mode === '3d') { arrows.q = arrows.Q = ['direction', -1]; arrows.e = arrows.E = ['direction', 1]; }
    if (!arrows[event.key] && event.code !== 'Space') return;
    event.preventDefault();
    if (game.phase !== 'aiming') return;
    if (event.code === 'Space') {
      if (!event.repeat) $('shot-form').requestSubmit();
    } else {
      const [id, direction] = arrows[event.key], input = $(id);
      const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), value + direction * (event.shiftKey ? 5 : 1)));
      input.focus({ preventScroll: true }); input.select();
    }
  });
  for (const id of ['angle', 'power', 'direction']) {
    const input = $(id), wrapper = input.closest('.number-wrap');
    wrapper.addEventListener('wheel', event => {
      if (input.disabled || game.phase !== 'aiming' || $('settings').open || event.ctrlKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      const step = event.shiftKey ? 5 : 1;
      const direction = event.deltaY < 0 ? 1 : -1;
      const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : 0;
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), value + direction * step));
      input.focus({ preventScroll: true }); input.select(); saveSession();
    }, { passive: false });
  }
  $('sound-toggle').addEventListener('click', () => {
    sound.setEnabled(!sound.enabled); classic.pause();
    $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled));
    $('sound-label').textContent = sound.enabled ? 'Ton an' : 'Ton aus';
    if (sound.enabled && mode !== 'classic') sound.play('round');
  });
  for (const id of ['setting-target', 'setting-gravity']) {
    const input = $(id);
    input.addEventListener('wheel', event => {
      if (!$('settings').open || event.ctrlKey || event.metaKey || !event.deltaY) return;
      event.preventDefault();
      if ($('mode-classic').checked) return;
      const step = Number(input.step) * (event.shiftKey ? 5 : 1);
      const value = Number.isFinite(input.valueAsNumber) ? input.valueAsNumber : Number(input.min);
      input.value = Math.max(Number(input.min), Math.min(Number(input.max), value + (event.deltaY < 0 ? step : -step))).toFixed(id === 'setting-gravity' ? 1 : 0);
      input.focus({ preventScroll: true }); input.select();
    }, { passive: false });
  }
  $('finale-skip').addEventListener('click', () => finale?.skip());
  $('finale').addEventListener('cancel', event => { event.preventDefault(); finale?.skip(); });
  $('continue').addEventListener('click', () => {
    sound.stop();
    if (game.continue()) { drawnTerrain = -1; syncUI(true); }
  });
  $('settings-open').addEventListener('click', () => {
    sound.stop(); classic.pause();
    populateSettings();
    $('settings').showModal();
  });
  $('settings-close').addEventListener('click', () => $('settings').close());
  $('settings').addEventListener('cancel', event => { if (!started || renderBlocked) event.preventDefault(); });
  $('settings-form').addEventListener('submit', event => {
    event.preventDefault();
    sound.stop();
    const nextMode = $('mode-classic').checked ? 'classic' : $('mode-3d').checked ? '3d' : '2d';
    if (nextMode === '3d' && !ensure3D()) return;
    renderBlocked = false; mode = nextMode; game = mode === '3d' ? new window.Gorillas3D.Game3D() : new Game();
    renderer3d?.closeReplay(); applyMode();
    game.reset({ names: [$('setting-name-0').value, $('setting-name-1').value], target: Number($('setting-target').value), gravity: Number($('setting-gravity').value), aimAssist: $('setting-aim-assist').checked, replay: $('setting-replay').checked });
    // Reset the camera before saving, including a reload before the first animation frame.
    if (mode === '3d') renderer3d.camera.update(game, renderer3d.clock, reducedMotion);
    savedInputs = savedCamera = null;
    started = true; $('settings-close').hidden = false;
    $('settings').close();
    if (mode === 'classic') {
      const options = { names: [$('setting-name-0').value, $('setting-name-1').value], target: Number($('setting-target').value), gravity: Number($('setting-gravity').value) };
      classic.start(options); game.options = { ...game.options, ...classic.game.options };
    } else sound.play('round');
    drawnTerrain = -1; syncUI(true); saveSession();
  });
  function frame(time) {
    const dt = previousTime ? Math.min((time - previousTime) / 1000, .05) : 0; previousTime = time;
    if (mode === 'classic') {
      if (started && !$('settings').open && !document.hidden) classic.update(dt);
      classic.draw();
      if ($('settings').open) draw(time);
      requestAnimationFrame(frame); return;
    }
    if (!document.hidden) { sceneryTime += dt * 1000; if (!reducedMotion) scenery.update(dt); }
    if (!$('settings').open && !document.hidden) {
      if (finale) finale.update(dt);
      else if (started) {
        const wasCharged = game.shot?.charged;
        if (mode !== '3d' || !renderer3d?.lost) game.update(dt); updateAmbientLights(dt);
        if (!wasCharged && game.shot?.charged && game.phase === 'flying') {
          $('message').textContent = 'Sonnenladung! Diese Banane hat jetzt mehr Wumms.';
          sound.play('round');
        }
      }
    }
    if (previousPhase !== game.phase || uiDirty) {
      if (previousPhase !== game.phase) {
        if (game.phase === 'impact') sound.play(game.impact.type);
        else if (game.phase === 'celebrating') sound.play(game.scores[game.winner] >= game.options.target ? 'champion' : 'cheer');
        else if (game.phase === 'aiming' && previousPhase === 'flying' && game.lastEvent === 'miss') sound.play('miss');
      }
      syncUI(previousPhase !== '' && game.phase === 'aiming'); previousPhase = game.phase;
    }
    draw(time); requestAnimationFrame(frame);
    if (started && game.phase === 'matchOver' && !finale && !$('settings').open && (mode !== '3d' || !renderer3d?.replay)) startFinale();
    if (finale) {
      finale.draw($('finale-art').getContext('2d'), game.winner, reducedMotion, drawGorilla);
      $('finale-progress').style.width = `${Math.min(100, finale.age / window.GorillaFinale.DURATION * 100)}%`;
    }
    saveTimer += dt;
    if (saveTimer >= .5) { saveTimer = 0; saveSession(); }
  }
  document.addEventListener('visibilitychange', () => {
    previousTime = 0;
    if (document.hidden) { sound.stop(); classic.pause(); }
    else if (finale) sound.play('finale', finale.age);
  });
  window.addEventListener('pagehide', saveSession);
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveSession(); });
  for (const id of ['angle', 'power', 'direction']) $(id).addEventListener('input', saveSession);
  if (mode === '3d' && !ensure3D()) renderBlocked = true;
  applyMode();
  syncUI();
  if (savedInputs && game.phase === 'aiming') { $('angle').value = savedInputs[0]; $('power').value = savedInputs[1]; $('direction').value = savedInputs[2] ?? 0; }
  previousPhase = game.phase;
  $('sound-toggle').setAttribute('aria-pressed', String(sound.enabled)); $('sound-label').textContent = sound.enabled ? 'Ton an' : 'Ton aus';
  if (!started || renderBlocked) { populateSettings(); $('settings-close').hidden = true; $('settings').showModal(); }
  requestAnimationFrame(frame);
})();
