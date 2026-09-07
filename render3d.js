/* WebGL2 presentation for the 3D city: instanced voxel blocks, generated textures, billboard actors, orbit camera. */
(function (root) {
  'use strict';
  const L = root.Gorillas3D;
  const { drawGorilla, drawBanana } = root.GorillaVisuals;
  const TILE = { ROOF: 12, FOLIAGE: 13, TRUNK: 14, GORILLA: 16, BANANA: 24, SUN: 25, SMOKE: 26, FIRE: 27, ARROW: 28, SCORCH: 29, CLOUD: 30, FUR: [32, 40], FURFACE: [33, 41], FURDARK: [34, 42], FURBELLY: [35, 43] };
  const POSES = ['idle', 'left', 'right', 'both'];
  const G_SCALE = 2.8;
  const furTile = (player, part) => TILE[['FUR', 'FURFACE', 'FURDARK', 'FURBELLY'][part === 'face' ? 1 : part === 'brow' ? 2 : (part === 'chest' || part === 'hips') ? 3 : 0]][player];
  const PLAYER_TINT = [[.95, .52, .31, 1], [.73, .83, .71, 1]];
  const PALETTE = [['#667b78', '#81918a'], ['#b78377', '#c69583'], ['#797986', '#94909a'], ['#445e64', '#60787c']];
  const FOG = [.93, .72, .62];
  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
  const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  /* Small mat4/vec3 helpers, column-major. */
  const norm3 = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
  function perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0];
  }
  function lookAt(eye, center, up) {
    const z = norm3([eye[0] - center[0], eye[1] - center[1], eye[2] - center[2]]);
    const x = norm3([up[1] * z[2] - up[2] * z[1], up[2] * z[0] - up[0] * z[2], up[0] * z[1] - up[1] * z[0]]);
    const y = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    return [x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
      -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1];
  }
  function mul(a, b) {
    const o = new Array(16);
    for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
    return o;
  }
  function project(m, p) {
    const w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    if (w <= 0) return null;
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w * .5 + .5, (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w * .5 + .5];
  }

  /* Procedural 1024px texture atlas: facades, roofs, foliage, actors and effects. */
  function buildAtlas() {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    const at = tile => [(tile % 8) * 128, Math.floor(tile / 8) * 128];
    const radial = (tile, stops) => {
      const [x, y] = at(tile), g = ctx.createRadialGradient(x + 64, y + 64, 4, x + 64, y + 64, 62);
      for (const [pos, color] of stops) g.addColorStop(pos, color);
      ctx.fillStyle = g; ctx.fillRect(x, y, 128, 128);
    };
    // Fur tiles for the voxel gorilla, one variant per player.
    for (let player = 0; player < 2; player++) {
      const colors = [['#d77b39', '#a45e33', '#de8c4a', '#c7996c'], ['#8aab92', '#5f806a', '#99b49b', '#adb69a']][player];
      const tiles = [TILE.FUR[player], TILE.FURFACE[player], TILE.FURDARK[player], TILE.FURBELLY[player]];
      for (let i = 0; i < 4; i++) {
        const [ox, oy] = at(tiles[i]);
        ctx.fillStyle = colors[i]; ctx.fillRect(ox, oy, 128, 128);
        const rand = seeded(player * 51 + i * 7 + 3);
        for (let s = 0; s < 160; s++) {
          ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.1)';
          ctx.fillRect(ox + rand() * 126, oy + rand() * 126, 2, 2);
        }
      }
      const [ox, oy] = at(TILE.FURFACE[player]);
      ctx.fillStyle = '#2e2019'; ctx.fillRect(ox + 42, oy + 58, 10, 10); ctx.fillRect(ox + 76, oy + 58, 10, 10);
      ctx.fillStyle = '#fff'; ctx.fillRect(ox + 44, oy + 60, 3, 3); ctx.fillRect(ox + 78, oy + 60, 3, 3);
      ctx.fillStyle = '#6e4f36'; ctx.fillRect(ox + 48, oy + 84, 32, 6);
    }
    // 12 facade variants: 4 palettes x 3 lighting patterns. One tile spans 34 x 32 world units (2 floors).
    for (let p = 0; p < 4; p++) for (let v = 0; v < 3; v++) {
      const [ox, oy] = at(p * 3 + v), [base, light] = PALETTE[p], rand = seeded(p * 911 + v * 77 + 5);
      ctx.fillStyle = base; ctx.fillRect(ox, oy, 128, 128);
      ctx.fillStyle = 'rgba(0,0,0,.13)'; ctx.fillRect(ox + 112, oy, 16, 128);
      ctx.fillStyle = light; ctx.fillRect(ox, oy, 128, 6);
      for (let f = 0; f < 2; f++) for (let b = 0; b < 3; b++) {
        const wx = ox + 14 + b * 38, wy = oy + 18 + f * 64, lit = rand() > .32;
        ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(wx - 2, wy - 2, 24, 32);
        ctx.fillStyle = lit ? '#e5c89a' : 'rgba(38,55,66,.85)'; ctx.fillRect(wx, wy, 20, 28);
        if (lit) { ctx.fillStyle = '#f7dcb0'; ctx.fillRect(wx, wy, 20, 8); }
      }
      const ao = ctx.createLinearGradient(0, oy + 88, 0, oy + 128);
      ao.addColorStop(0, 'rgba(0,0,0,0)'); ao.addColorStop(1, 'rgba(0,0,0,.3)');
      ctx.fillStyle = ao; ctx.fillRect(ox, oy + 88, 128, 40);
    }
    { // Roof with parapet and gravel.
      const [ox, oy] = at(TILE.ROOF), rand = seeded(99);
      ctx.fillStyle = '#5a605b'; ctx.fillRect(ox, oy, 128, 128);
      for (let i = 0; i < 350; i++) {
        ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.07)' : 'rgba(0,0,0,.12)';
        ctx.fillRect(ox + rand() * 128, oy + rand() * 128, 2, 2);
      }
      ctx.strokeStyle = '#434a45'; ctx.lineWidth = 10; ctx.strokeRect(ox + 5, oy + 5, 118, 118);
      ctx.strokeStyle = '#6b736c'; ctx.lineWidth = 2; ctx.strokeRect(ox + 10, oy + 10, 108, 108);
    }
    { // Foliage and trunk.
      const [ox, oy] = at(TILE.FOLIAGE), rand = seeded(7);
      ctx.fillStyle = '#557f49'; ctx.fillRect(ox, oy, 128, 128);
      for (let i = 0; i < 280; i++) {
        ctx.fillStyle = ['#476f3e', '#689257', '#3f6338'][i % 3];
        ctx.globalAlpha = .5; ctx.fillRect(ox + rand() * 124, oy + rand() * 124, 2 + rand() * 4, 2 + rand() * 4);
      }
      ctx.globalAlpha = 1;
      const shade = ctx.createLinearGradient(ox, oy, ox, oy + 128);
      shade.addColorStop(0, 'rgba(255,255,255,.1)'); shade.addColorStop(1, 'rgba(0,0,0,.25)');
      ctx.fillStyle = shade; ctx.fillRect(ox, oy, 128, 128);
      const [tx, ty] = at(TILE.TRUNK);
      ctx.fillStyle = '#6d4c34'; ctx.fillRect(tx, ty, 128, 128);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(tx + rand() * 124, ty, 3, 128);
      }
    }
    // Gorilla actors: 4 poses per player, pixel-exact at 3x scale.
    for (let player = 0; player < 2; player++) POSES.forEach((pose, i) => {
      const [ox, oy] = at(TILE.GORILLA + player * 4 + i);
      ctx.save(); ctx.translate(ox + 16, oy + 13); ctx.scale(3, 3);
      drawGorilla(ctx, 16, 0, player, pose); ctx.restore();
    });
    { // Banana.
      const [ox, oy] = at(TILE.BANANA);
      ctx.save(); ctx.translate(ox + 64, oy + 64); ctx.scale(1.8, 1.8); drawBanana(ctx, 0, 0, 0); ctx.restore();
    }
    radial(TILE.SUN, [[0, '#fffbe8'], [.25, '#ffe9a8'], [.55, 'rgba(255,205,110,.5)'], [1, 'rgba(255,205,110,0)']]);
    radial(TILE.FIRE, [[0, '#fff6cf'], [.3, '#ffc46a'], [.62, 'rgba(240,110,40,.7)'], [1, 'rgba(240,110,40,0)']]);
    radial(TILE.SMOKE, [[0, 'rgba(150,146,140,.85)'], [.55, 'rgba(120,116,110,.4)'], [1, 'rgba(120,116,110,0)']]);
    radial(TILE.SCORCH, [[0, 'rgba(20,16,13,.85)'], [.6, 'rgba(25,20,16,.4)'], [1, 'rgba(25,20,16,0)']]);
    { // Downward chevron, tinted per player at draw time.
      const [ox, oy] = at(TILE.ARROW);
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(ox + 36, oy + 46); ctx.lineTo(ox + 64, oy + 82); ctx.lineTo(ox + 92, oy + 46);
      ctx.lineTo(ox + 92, oy + 62); ctx.lineTo(ox + 64, oy + 96); ctx.lineTo(ox + 36, oy + 62); ctx.closePath(); ctx.fill();
    }
    { // Soft cloud blob.
      const [ox, oy] = at(TILE.CLOUD);
      for (const [cx, cy, r] of [[40, 80, 30], [70, 70, 38], [100, 78, 30], [64, 90, 34], [92, 90, 26]]) {
        const g = ctx.createRadialGradient(ox + cx, oy + cy, 2, ox + cx, oy + cy, r);
        g.addColorStop(0, 'rgba(255,244,230,.55)'); g.addColorStop(1, 'rgba(255,244,230,0)');
        ctx.fillStyle = g; ctx.fillRect(ox, oy, 128, 128);
      }
    }
    return canvas;
  }

  /* Streets, sidewalks, parks and plazas baked into one ground texture per round. */
  function buildGroundCanvas(game) {
    const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 704;
    const ctx = canvas.getContext('2d');
    const kx = 1024 / 880, kz = 704 / 580;
    const X = x => (x + 40) * kx, Z = z => (z + 40) * kz;
    const rand = seeded(game.round * 7919 + 13);
    ctx.fillStyle = '#454a51'; ctx.fillRect(0, 0, 1024, 704);
    for (let i = 0; i < 2600; i++) {
      ctx.fillStyle = rand() > .5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.09)';
      ctx.fillRect(rand() * 1024, rand() * 704, 2, 2);
    }
    for (const b of game.blocks) {
      ctx.fillStyle = '#93988f'; ctx.fillRect(X(b.x - 5), Z(b.z - 5), 78 * kx, 78 * kz);
      if (b.type === 'park') {
        ctx.fillStyle = '#6f9a5b'; ctx.fillRect(X(b.x), Z(b.z), L.BLOCK * kx, L.BLOCK * kz);
        for (let i = 0; i < 220; i++) {
          ctx.fillStyle = rand() > .5 ? 'rgba(70,110,60,.5)' : 'rgba(140,185,110,.4)';
          ctx.fillRect(X(b.x) + rand() * L.BLOCK * kx, Z(b.z) + rand() * L.BLOCK * kz, 3, 3);
        }
        ctx.strokeStyle = '#c0ae87'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.moveTo(X(b.x), Z(b.z + L.BLOCK * .3)); ctx.quadraticCurveTo(X(b.x + 40), Z(b.z + 44), X(b.x + L.BLOCK), Z(b.z + L.BLOCK * .7)); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(X(b.x + L.BLOCK * .3), Z(b.z)); ctx.quadraticCurveTo(X(b.x + 40), Z(b.z + 30), X(b.x + L.BLOCK * .7), Z(b.z + L.BLOCK)); ctx.stroke();
      } else if (b.type === 'plaza') {
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          ctx.fillStyle = (i + j) % 2 ? '#9aa0a4' : '#8f9599';
          ctx.fillRect(X(b.x) + i * 17 * kx, Z(b.z) + j * 17 * kz, 17 * kx, 17 * kz);
        }
      } else {
        ctx.fillStyle = '#83867d'; ctx.fillRect(X(b.x), Z(b.z), L.BLOCK * kx, L.BLOCK * kz);
        ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 1;
        for (let i = 1; i < 4; i++) {
          ctx.beginPath(); ctx.moveTo(X(b.x + i * 17), Z(b.z)); ctx.lineTo(X(b.x + i * 17), Z(b.z + L.BLOCK)); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(X(b.x), Z(b.z + i * 17)); ctx.lineTo(X(b.x + L.BLOCK), Z(b.z + i * 17)); ctx.stroke();
        }
      }
    }
    ctx.fillStyle = 'rgba(216,210,178,.5)';
    for (let i = 0; i <= L.COLS; i++) {
      const x = L.ORIGIN_X - L.STREET / 2 + i * L.PITCH;
      for (let z = -30; z < L.WORLD_Z + 20; z += 22) ctx.fillRect(X(x) - 2, Z(z), 4, 11);
    }
    for (let j = 0; j <= L.ROWS; j++) {
      const z = L.ORIGIN_Z - L.STREET / 2 + j * L.PITCH;
      for (let x = -30; x < L.WORLD_X + 20; x += 22) ctx.fillRect(X(x), Z(z) - 2, 11, 4);
    }
    return canvas;
  }

  const VS_CUBE = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 iMin;
layout(location=3) in vec3 iSize;
layout(location=4) in vec2 iTiles;
layout(location=5) in float iYaw;
uniform mat4 uVP;
out vec2 vUV; out vec3 vNorm; out vec3 vWorld; flat out float vTile;
void main() {
  float cy = cos(iYaw), sy = sin(iYaw);
  vec3 c = aPos * iSize - iSize * .5;
  vec3 world = iMin + iSize * .5 + vec3(c.x * cy + c.z * sy, c.y, -c.x * sy + c.z * cy);
  vWorld = world;
  vNorm = vec3(aNormal.x * cy + aNormal.z * sy, aNormal.y, -aNormal.x * sy + aNormal.z * cy);
  if (abs(vNorm.y) > .5) { vUV = aPos.xz * vec2(iSize.x, iSize.z) / 34.0; vTile = iTiles.y; }
  else if (abs(vNorm.x) > .5) { vUV = aPos.zy * vec2(iSize.z, iSize.y) / vec2(34.0, 32.0); vTile = iTiles.x; }
  else { vUV = aPos.xy * vec2(iSize.x, iSize.y) / vec2(34.0, 32.0); vTile = iTiles.x; }
  gl_Position = uVP * vec4(world, 1.0);
}`;
  const FS_CUBE = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vNorm; in vec3 vWorld; flat in float vTile;
uniform sampler2D uAtlas; uniform vec3 uSunDir; uniform vec3 uFog; uniform vec3 uCamPos;
out vec4 outColor;
void main() {
  vec2 uv = vec2((mod(vTile, 8.0) + fract(vUV.x)) / 8.0, (7.0 - floor(vTile / 8.0) + fract(vUV.y)) / 8.0);
  vec3 tex = texture(uAtlas, uv).rgb;
  float diff = max(dot(normalize(vNorm), uSunDir), 0.0);
  float shade = (0.5 + 0.6 * diff) * (0.72 + 0.28 * clamp(vWorld.y / 140.0, 0.0, 1.0));
  vec3 color = tex * shade;
  color = mix(color, uFog, smoothstep(550.0, 1500.0, distance(vWorld, uCamPos)));
  outColor = vec4(color, 1.0);
}`;
  const VS_QUAD = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUV;
uniform mat4 uVP;
out vec2 vUV; out vec3 vWorld;
void main() { vUV = aUV; vWorld = aPos; gl_Position = uVP * vec4(aPos, 1.0); }`;
  const FS_GROUND = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vWorld;
uniform sampler2D uTex; uniform vec3 uFog; uniform vec3 uCamPos;
out vec4 outColor;
void main() {
  vec3 color = texture(uTex, vUV).rgb * 0.98;
  color = mix(color, uFog, smoothstep(450.0, 1400.0, distance(vWorld, uCamPos)));
  outColor = vec4(color, 1.0);
}`;
  const VS_SKY = `#version 300 es
out vec2 vScr;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vScr = p; gl_Position = vec4(p * 2.0 - 1.0, 0.999, 1.0);
}`;
  const FS_SKY = `#version 300 es
precision highp float;
in vec2 vScr; uniform vec2 uSunUv; uniform float uSunOn;
out vec4 outColor;
void main() {
  float v = clamp(vScr.y, 0.0, 1.0);
  vec3 color = v < .4 ? mix(vec3(.85, .58, .53), vec3(.94, .74, .63), v / .4) : mix(vec3(.94, .74, .63), vec3(.6, .7, .76), (v - .4) / .6);
  float d = distance(vScr * vec2(1.78, 1.0), uSunUv * vec2(1.78, 1.0));
  color += vec3(1.0, .82, .55) * exp(-d * d * 9.0) * .45 * uSunOn;
  outColor = vec4(color, 1.0);
}`;
  const VS_BILLBOARD = `#version 300 es
precision highp float;
layout(location=0) in vec2 aCorner;
layout(location=1) in vec3 iPos;
layout(location=2) in vec2 iSize;
layout(location=3) in vec2 iTileRot;
layout(location=4) in vec4 iTint;
layout(location=5) in float iMode;
uniform mat4 uVP; uniform vec3 uCamRight;
out vec2 vUV; out vec4 vTint; out vec3 vWorld;
void main() {
  float c = cos(iTileRot.y), s = sin(iTileRot.y);
  vec2 rc = mat2(c, s, -s, c) * (aCorner * iSize);
  vec3 world = iMode > .5 ? iPos + vec3(rc.x, 0.0, rc.y) : iPos + uCamRight * rc.x + vec3(0.0, rc.y, 0.0);
  vWorld = world; vTint = iTint;
  float tile = iTileRot.x;
  vUV = vec2((mod(tile, 8.0) + aCorner.x * .5 + .5) / 8.0, (7.0 - floor(tile / 8.0) + aCorner.y * .5 + .5) / 8.0);
  gl_Position = uVP * vec4(world, 1.0);
}`;
  const FS_BILLBOARD = `#version 300 es
precision highp float;
in vec2 vUV; in vec4 vTint; in vec3 vWorld;
uniform sampler2D uAtlas; uniform vec3 uFog; uniform vec3 uCamPos;
out vec4 outColor;
void main() {
  vec4 tex = texture(uAtlas, vUV);
  float alpha = tex.a * vTint.a;
  if (alpha < .02) discard;
  vec3 color = tex.rgb * vTint.rgb;
  color = mix(color, uFog, smoothstep(550.0, 1500.0, distance(vWorld, uCamPos)) * .8);
  outColor = vec4(color, alpha);
}`;

  class Renderer3D {
    constructor(canvas) {
      this.canvas = canvas;
      const gl = this.gl = canvas.getContext('webgl2', { antialias: true });
      if (!gl) throw new Error('WebGL2 is not available');
      const compile = (type, src) => {
        const shader = gl.createShader(type); gl.shaderSource(shader, src); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        return shader;
      };
      const program = (vs, fs) => {
        const p = gl.createProgram();
        gl.attachShader(p, compile(gl.VERTEX_SHADER, vs)); gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
      };
      const uniforms = (p, names) => Object.fromEntries(names.map(n => [n, gl.getUniformLocation(p, n)]));
      this.progSky = program(VS_SKY, FS_SKY); this.uSky = uniforms(this.progSky, ['uSunUv', 'uSunOn']);
      this.progGround = program(VS_QUAD, FS_GROUND); this.uGround = uniforms(this.progGround, ['uVP', 'uTex', 'uFog', 'uCamPos']);
      this.progCube = program(VS_CUBE, FS_CUBE); this.uCube = uniforms(this.progCube, ['uVP', 'uAtlas', 'uSunDir', 'uFog', 'uCamPos']);
      this.progBill = program(VS_BILLBOARD, FS_BILLBOARD); this.uBill = uniforms(this.progBill, ['uVP', 'uCamRight', 'uAtlas', 'uFog', 'uCamPos']);
      const upload = source => {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
        if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
        return tex;
      };
      this.texAtlas = upload(buildAtlas());
      this.texGround = null;
      // Unit cube (24 corners, per-face normals) with instanced min/size/tiles.
      this.cubeVao = gl.createVertexArray(); gl.bindVertexArray(this.cubeVao);
      const pos = [], norm = [], idx = [];
      const faces = [
        [[1, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], [[-1, 0, 0], [0, 0, 0], [0, 0, 1], [0, 1, 0]],
        [[0, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 0]], [[0, -1, 0], [0, 0, 0], [1, 0, 0], [0, 0, 1]],
        [[0, 0, 1], [0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0], [1, 0, 0]]
      ];
      for (const [n, base, u, v] of faces) {
        const start = pos.length / 3;
        for (const [a, b, c] of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]]) {
          // p = base + a*u + b*v (c stays 0; corners ordered so the face is CCW from outside)
          const corner = [base[0] + u[0] * a + v[0] * b, base[1] + u[1] * a + v[1] * b, base[2] + u[2] * a + v[2] * b];
          // remap: corners are base, base+u, base+u+v, base+v
          pos.push(...corner); norm.push(...n);
        }
        idx.push(start, start + 1, start + 2, start, start + 2, start + 3);
      }
      // Reorder corners: [base, base+u, base+u+v, base+v] is what the loop above produced via (a,b).
      const buffer = (data, target = gl.ARRAY_BUFFER) => {
        const buf = gl.createBuffer(); gl.bindBuffer(target, buf); gl.bufferData(target, data, gl.STATIC_DRAW); return buf;
      };
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(pos)));
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(norm)));
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER));
      this.cubeInstances = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeInstances);
      gl.bufferData(gl.ARRAY_BUFFER, 9 * 4 * 8192, gl.DYNAMIC_DRAW);
      for (const [loc, size, offset] of [[2, 3, 0], [3, 3, 12], [4, 2, 24], [5, 1, 32]]) {
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset); gl.vertexAttribDivisor(loc, 1);
      }
      // Separate buffer for dynamic gorilla cubes.
      this.gorillaVao = gl.createVertexArray(); gl.bindVertexArray(this.gorillaVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(pos)));
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(norm)));
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer(new Uint16Array(idx), gl.ELEMENT_ARRAY_BUFFER));
      this.gorillaInstances = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.gorillaInstances);
      gl.bufferData(gl.ARRAY_BUFFER, 9 * 4 * 64, gl.DYNAMIC_DRAW);
      for (const [loc, size, offset] of [[2, 3, 0], [3, 3, 12], [4, 2, 24], [5, 1, 32]]) {
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 36, offset); gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null); gl.bindVertexArray(this.cubeVao);
      // Ground quad covering the world plus margins.
      this.groundVao = gl.createVertexArray(); gl.bindVertexArray(this.groundVao);
      const g = [-40, 0, -40, 840, 0, -40, 840, 0, 540, -40, 0, 540];
      // v runs against the canvas z axis because the upload flips Y.
      const guv = [0, 1, 1, 1, 1, 0, 0, 0];
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(g)));
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array(guv)));
      gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer(new Uint16Array([0, 1, 2, 0, 2, 3]), gl.ELEMENT_ARRAY_BUFFER));
      // Billboard quad with per-instance data, 12 floats per instance.
      this.billVao = gl.createVertexArray(); gl.bindVertexArray(this.billVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer(new Float32Array([-1, -1, 1, -1, 1, 1, -1, 1])));
      gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, buffer(new Uint16Array([0, 1, 2, 0, 2, 3]), gl.ELEMENT_ARRAY_BUFFER));
      this.billInstances = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.billInstances);
      gl.bufferData(gl.ARRAY_BUFFER, 12 * 4 * 512, gl.DYNAMIC_DRAW);
      for (const [loc, size, offset] of [[1, 3, 0], [2, 2, 12], [3, 2, 20], [4, 4, 28], [5, 1, 44]]) {
        gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 48, offset); gl.vertexAttribDivisor(loc, 1);
      }
      gl.bindVertexArray(null);
      this.sunDir = norm3([L.SUN.x - 400, L.SUN.y, L.SUN.z - 250]);
      this.eye = [0, 200, -300]; this.look = [400, 100, 250]; this.camInit = false;
      this.orbit = { yaw: 0, pitch: 0, zoom: 1 }; this.orbitTarget = { yaw: 0, pitch: 0, zoom: 1 };
      this.fov = 55 * Math.PI / 180;
      this.lastAimKey = -1;
      this.lastTime = 0; this.cubeCount = 0;
      this.attachControls();
    }
    attachControls() {
      const canvas = this.canvas; let drag = null;
      const groundAnchor = (mx, my) => {
        const rect = canvas.getBoundingClientRect();
        const x = (mx - rect.left) / rect.width * 2 - 1, y = 1 - (my - rect.top) / rect.height * 2;
        const tanF = Math.tan(this.fov / 2), aspect = rect.width / rect.height;
        const fwd = norm3([this.look[0] - this.eye[0], this.look[1] - this.eye[1], this.look[2] - this.eye[2]]);
        const right = norm3([-fwd[2], 0, fwd[0]]);
        const up = [right[1] * fwd[2] - right[2] * fwd[1], right[2] * fwd[0] - right[0] * fwd[2], right[0] * fwd[1] - right[1] * fwd[0]];
        const dir = norm3([
          fwd[0] + right[0] * x * tanF * aspect + up[0] * y * tanF,
          fwd[1] + right[1] * x * tanF * aspect + up[1] * y * tanF,
          fwd[2] + right[2] * x * tanF * aspect + up[2] * y * tanF
        ]);
        if (dir[1] > -.001) return null;
        const t = -this.eye[1] / dir[1];
        return [this.eye[0] + dir[0] * t, 0, this.eye[2] + dir[2] * t];
      };
      canvas.addEventListener('pointerdown', event => {
        drag = { x: event.clientX, y: event.clientY, vx: 0, vy: 0, lastT: event.timeStamp };
        canvas.setPointerCapture(event.pointerId);
      });
      canvas.addEventListener('pointermove', event => {
        if (!drag) return;
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        const dt = Math.max(8, event.timeStamp - drag.lastT);
        drag.x = event.clientX; drag.y = event.clientY;
        drag.vx = dx / dt; drag.vy = dy / dt; drag.lastT = event.timeStamp;
        const rect = canvas.getBoundingClientRect();
        // Pixel-consistent orbit: dragging across the viewport sweeps the full field of view.
        const aspect = rect.width / rect.height;
        this.orbitTarget.yaw += dx * 2 * Math.tan(this.fov / 2) * aspect / rect.width;
        this.orbitTarget.pitch = clamp(this.orbitTarget.pitch + dy * 2 * Math.tan(this.fov / 2) / rect.height, .06, 1.25);
      });
      for (const type of ['pointerup', 'pointercancel']) canvas.addEventListener(type, event => {
        if (drag && type === 'pointerup') {
          // Gentle inertia after a flick, damped quickly.
          const rect = canvas.getBoundingClientRect();
          this.inertia = { yaw: drag.vx * 2 * Math.tan(this.fov / 2) * (rect.width / rect.height) / rect.width, pitch: drag.vy * 2 * Math.tan(this.fov / 2) / rect.height };
        }
        drag = null;
      });
      canvas.addEventListener('wheel', event => {
        if (event.ctrlKey || event.metaKey) return;
        event.preventDefault();
        const anchor = groundAnchor(event.clientX, event.clientY);
        const factor = Math.exp(clamp(event.deltaY, -200, 200) * .0012);
        this.orbitTarget.zoom = clamp(this.orbitTarget.zoom * factor, .35, 2.4);
        if (anchor) {
          // Keep the ground point under the cursor fixed while zooming.
          const off = [this.look[0] - anchor[0], this.look[2] - anchor[2]];
          const d = Math.hypot(off[0], off[1]);
          if (d > 1) {
            const nd = d * factor;
            this.orbitTarget.lookShift = [anchor[0] + off[0] / d * nd, 0, anchor[2] + off[1] / d * nd];
          }
        }
      }, { passive: false });
    }
    buildInstances(game) {
      const data = [];
      const cube = (x, y, z, w, h, d, side, roof) => data.push(x, y, z, w, h, d, side, roof, 0);
      for (const b of game.blocks) {
        if (b.type === 'building') {
          for (let i = b.chunkStart; i < b.chunkStart + b.chunkCount; i++) {
            const c = game.chunks[i];
            if (c.alive) cube(c.x, c.y, c.z, c.w, c.h, c.d, c.side, TILE.ROOF);
          }
        } else if (b.type === 'park') {
          for (const t of b.trees) {
            cube(t.x - 1.5, 0, t.z - 1.5, 3, t.s * .55, 3, TILE.TRUNK, TILE.TRUNK);
            cube(t.x - t.s / 2, t.s * .45, t.z - t.s / 2, t.s, t.s * .9, t.s, TILE.FOLIAGE, TILE.FOLIAGE);
          }
        }
      }
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cubeInstances);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.DYNAMIC_DRAW);
      this.cubeCount = data.length / 9;
    }
    gorillaCubes(game, player, time, celebrating, reducedMotion) {
      // Voxel gorilla that stands on the roof and faces the throw direction.
      const g = game.gorillas[player], other = game.gorillas[1 - player];
      const yaw = Math.atan2(other.x - g.x, -(other.z - g.z));
      const sin = Math.sin(yaw), cos = Math.cos(yaw);
      const celebrate = celebrating && game.winner === player;
      const jump = celebrate && !reducedMotion ? Math.abs(Math.sin(time * 7)) * 6 : 0;
      const armRaise = celebrate ? (reducedMotion ? 1 : Math.abs(Math.sin(time * 7))) : 0;
      const out = [];
      for (const v of L.GORILLA3D_VOXELS) {
        let vy = v.y, vh = v.h;
        if (v.part === 'arm' && celebrate) {
          // Arms swing from the shoulders upward.
          const pivot = 4.5 * 1.8;
          vy = pivot + (v.y - pivot) * Math.cos(armRaise * 1.9) + 10;
        }
        // Rotate around the part center, then place so the gorilla stands ON the roof.
        const lx = v.x + v.w / 2, lz = v.z + v.d / 2;
        const wx = g.x + (lx * cos + lz * sin) * G_SCALE;
        const wz = g.z + (-lx * sin + lz * cos) * G_SCALE;
        // y is the bottom of the voxel in world space: feet at g.y, roof level.
        out.push({ x: wx - v.w / 2 * G_SCALE, y: g.y + (vy + jump) * G_SCALE, z: wz - v.d / 2 * G_SCALE, w: v.w * G_SCALE, h: vh * G_SCALE, d: v.d * G_SCALE, side: furTile(player, v.part), yaw });
      }
      return out;
    }
    setCity(game) {
      if (this.texGround) this.gl.deleteTexture(this.texGround);
      const gl = this.gl, canvas = buildGroundCanvas(game);
      const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const aniso = gl.getExtension('EXT_texture_filter_anisotropic');
      if (aniso) gl.texParameterf(gl.TEXTURE_2D, aniso.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, gl.getParameter(aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
      this.texGround = tex;
      this.buildInstances(game);
      this.orbitTarget = { yaw: 0, pitch: 0, zoom: 1, lookShift: [0, 0, 0] };
      this.orbit = { yaw: 0, pitch: 0, zoom: 1, lookShift: [0, 0, 0] };
      this.camInit = false; this.lastAimKey = -1;
    }
    syncDestruction(game) { this.buildInstances(game); }
    updateCamera(game, dt, time) {
      const gorillas = game.gorillas;
      let eye, look, speed = 4.5;
      if (game.phase === 'flying' && game.shot) {
        const s = game.shot, t = s.time;
        const vel = norm3([s.vx + game.wind / 5 * t, s.vy - game.options.gravity * t, s.vz]);
        eye = [s.x - vel[0] * 130, Math.max(24, s.y - vel[1] * 130 + 45), s.z - vel[2] * 130];
        look = [s.x, s.y, s.z]; speed = 8;
      } else if ((game.phase === 'impact' || game.phase === 'celebrating') && game.impact && game.winner === null) {
        const i = game.impact, out = norm3([i.x - 400, 0, i.z - 250]);
        eye = [i.x + out[0] * 190, i.y + 115, i.z + out[2] * 190]; look = [i.x, i.y, i.z]; speed = 3.5;
      } else if (game.winner !== null && game.gorillas[game.winner].alive && game.phase !== 'aiming') {
        const w = gorillas[game.winner], a = time * .45;
        eye = [w.x + Math.cos(a) * 165, w.y + 105, w.z + Math.sin(a) * 165];
        look = [w.x, w.y + 20, w.z]; speed = 3;
      } else {
        const aimKey = game.round * 2 + game.turn;
        if (aimKey !== this.lastAimKey) {
          this.orbitTarget = { yaw: 0, pitch: 0, zoom: 1, lookShift: [0, 0, 0] };
          this.orbit = { yaw: 0, pitch: 0, zoom: 1, lookShift: [0, 0, 0] };
          this.lastAimKey = aimKey;
        }
        const thr = gorillas[game.turn], opp = gorillas[1 - game.turn];
        const fw = norm3([opp.x - thr.x, 0, opp.z - thr.z]);
        eye = [thr.x - fw[0] * 100 - fw[2] * 20, Math.max(thr.y, opp.y) + 65, thr.z - fw[2] * 100 + fw[0] * 20];
        look = [thr.x + (opp.x - thr.x) * .3, (thr.y + opp.y) / 2 + 20, thr.z + (opp.z - thr.z) * .3];
      }
      // Inertia after a drag flick, quickly damped.
      if (this.inertia) {
        this.orbitTarget.yaw += this.inertia.yaw * 16;
        this.orbitTarget.pitch = clamp(this.orbitTarget.pitch + this.inertia.pitch * 16, .06, 1.25);
        this.inertia.yaw *= .82; this.inertia.pitch *= .82;
        if (Math.hypot(this.inertia.yaw, this.inertia.pitch) < 1e-5) this.inertia = null;
      }
      if (!this.camInit) { this.eye = eye.slice(); this.look = look.slice(); this.camInit = true; }
      const k = 1 - Math.exp(-dt * speed);
      for (let i = 0; i < 3; i++) {
        this.eye[i] += (eye[i] - this.eye[i]) * k;
        this.look[i] += (look[i] - this.look[i]) * k;
      }
      const ok = 1 - Math.exp(-dt * 12);
      this.orbit.yaw += (this.orbitTarget.yaw - this.orbit.yaw) * ok;
      this.orbit.pitch += (this.orbitTarget.pitch - this.orbit.pitch) * ok;
      this.orbit.zoom += (this.orbitTarget.zoom - this.orbit.zoom) * ok;
      if (this.orbitTarget.lookShift) {
        for (let i = 0; i < 3; i++) {
          this.orbit.lookShift[i] += (this.orbitTarget.lookShift[i] - this.orbit.lookShift[i]) * ok;
          this.look[i] += this.orbit.lookShift[i] * .12;
          this.eye[i] += this.orbit.lookShift[i] * .12;
        }
      }
      const off = [this.eye[0] - this.look[0], this.eye[1] - this.look[1], this.eye[2] - this.look[2]];
      let r = Math.hypot(...off), theta = Math.atan2(off[0], off[2]), phi = Math.asin(clamp(off[1] / r, -1, 1));
      theta += this.orbit.yaw; phi = clamp(phi + this.orbit.pitch, .06, 1.25); r = clamp(r * this.orbit.zoom, 60, 1500);
      this.eye = [this.look[0] + r * Math.cos(phi) * Math.sin(theta), this.look[1] + r * Math.sin(phi), this.look[2] + r * Math.cos(phi) * Math.cos(theta)];
    }
    billboards(game, ui, time, aimPoint) {
      const list = [];
      const push = (x, y, z, sx, sy, tile, rot = 0, tint = [1, 1, 1, 1], mode = 0) => list.push([x, y, z, sx, sy, tile, rot, tint, mode]);
      const { SUN } = L;
      push(SUN.x, SUN.y, SUN.z, 150, 150, TILE.SUN, 0, [1, 1, 1, .85]);
      push(SUN.x, SUN.y, SUN.z, 56, 56, TILE.SUN, 0, [1, 1, 1, 1]);
      for (let i = 0; i < 6; i++) {
        const drift = ui.reducedMotion ? 0 : time * 3.5 * (i % 2 ? .7 : 1);
        push(((i * 173 + drift) % 1000) - 100, 385 + (i * 53) % 85, (i * 211) % 560 - 30, 130 + i * 16, 60 + i * 7, TILE.CLOUD, 0, [1, .98, .95, .5]);
      }
      for (const c of game.craters) if (c.y <= 1) push(c.x, .5, c.z, c.radius * 2.2, c.radius * 2.2, TILE.SCORCH, 0, [1, 1, 1, .6], 1);
      const celebrating = game.winner !== null && game.phase !== 'impact';
      if (game.phase === 'aiming') {
        game.gorillas.forEach((gorilla, player) => {
          if (!gorilla.alive) return;
          push(gorilla.x, gorilla.y + .5, gorilla.z, 26, 26, TILE.SCORCH, 0, [1, 1, 1, .32], 1);
          if (game.turn === player) {
            const bob = ui.reducedMotion ? 0 : Math.sin(time * 4) * 3;
            push(gorilla.x, gorilla.y + 58 + bob, gorilla.z, 15, 15, TILE.ARROW, 0, PLAYER_TINT[player]);
          }
        });
      }
      const shot = game.shot;
      if (shot && game.phase === 'flying') {
        shot.trail.forEach((p, i) => push(p.x, p.y, p.z, 7, 7, TILE.SMOKE, 0, [1, .95, .75, i / shot.trail.length * .5]));
        if (shot.charged) push(shot.x, shot.y, shot.z, 46, 46, TILE.FIRE, 0, [1, .95, .68, .55]);
        push(shot.x, shot.y, shot.z, 26, 26, TILE.BANANA, Math.floor(shot.time * 10) * Math.PI / 2);
        push(shot.x, .5, shot.z, 16, 16, TILE.SCORCH, 0, [1, 1, 1, clamp(1 - shot.y / 320, 0, 1) * .5], 1);
      }
      const impact = game.impact;
      if (impact && impact.age < 1.8) {
        const t = impact.age, sizeF = clamp(impact.radius / 26, .8, 2.2);
        if (ui.reducedMotion) {
          push(impact.x, impact.y + 8, impact.z, 30 * sizeF, 30 * sizeF, TILE.FIRE, 0, [1, .8, .5, Math.max(0, 1 - t / .8) * .7]);
        } else {
          for (let i = 0; i < 7; i++) {
            const a = i * 2.399, spread = (6 + t * 16) * sizeF;
            push(impact.x + Math.cos(a) * spread + game.wind * t * 1.6, impact.y + t * (20 + i * 3) + Math.sin(a) * spread * .35, impact.z + Math.sin(a * 1.7) * spread * .6,
              (10 + t * 14) * sizeF, (10 + t * 14) * sizeF, TILE.SMOKE, 0, [.45, .43, .4, Math.min(.34, t * 1.8) * Math.max(0, 1 - t / 1.8)]);
          }
          if (t < .5) {
            const e = Math.sin(Math.min(1, t / .24) * Math.PI / 2);
            const tint = impact.charged ? [1, .93, .66, (1 - t / .5) * .95] : [1, .8, .5, (1 - t / .5) * .95];
            push(impact.x, impact.y + t * 6, impact.z, (26 + e * impact.radius * 1.7), (26 + e * impact.radius * 1.7), TILE.FIRE, 0, tint);
          }
          for (let i = 0; i < 18; i++) {
            const a = i * 2.399 + .4, sp = (30 + (i * 37 % 70)) * sizeF;
            const alpha = Math.max(0, 1 - t / 1.3);
            push(impact.x + Math.cos(a) * sp * t + game.wind * t * t, impact.y + (Math.sin(a) * sp * .7 + 24) * t - 70 * t * t, impact.z + Math.sin(a * 2.3) * sp * .5 * t,
              3.5, 3.5, TILE.FIRE, 0, t < .35 ? [1, .8, .45, alpha] : [.3, .28, .26, alpha]);
          }
        }
      }
      if (aimPoint) push(aimPoint.x, aimPoint.y + 4, aimPoint.z, 12, 12, TILE.FIRE, 0, [1, .9, .6, .8]);
      return list;
    }
    buildGorillaData(game, ui, time) {
      const data = [];
      const celebrating = game.winner !== null && game.phase !== 'impact';
      for (let player = 0; player < 2; player++) {
        if (!game.gorillas[player].alive) continue;
        for (const c of this.gorillaCubes(game, player, time, celebrating, ui.reducedMotion)) {
          data.push(c.x, c.y, c.z, c.w, c.h, c.d, c.side, c.side, c.yaw);
        }
      }
      return data;
    }
    draw(game, ui, time) {
      const gl = this.gl;
      const dt = this.lastTime ? Math.min(time - this.lastTime, .05) : 0; this.lastTime = time;
      this.updateCamera(game, dt, time);
      const w = this.canvas.width, h = this.canvas.height;
      const vp = mul(perspective(55 * Math.PI / 180, w / h, 2, 3200), lookAt(this.eye, this.look, [0, 1, 0]));
      const fwd = norm3([this.look[0] - this.eye[0], this.look[1] - this.eye[1], this.look[2] - this.eye[2]]);
      const right = norm3([-fwd[2], 0, fwd[0]]);
      gl.viewport(0, 0, w, h);
      gl.clearColor(FOG[0], FOG[1], FOG[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // Sky without depth, then the world on top.
      gl.disable(gl.DEPTH_TEST);
      gl.useProgram(this.progSky);
      const sunUv = project(vp, [L.SUN.x, L.SUN.y, L.SUN.z]);
      gl.uniform2f(this.uSky.uSunUv, sunUv ? sunUv[0] : 0, sunUv ? sunUv[1] : 0);
      gl.uniform1f(this.uSky.uSunOn, sunUv ? 1 : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.enable(gl.DEPTH_TEST);
      gl.useProgram(this.progGround);
      gl.uniformMatrix4fv(this.uGround.uVP, false, vp);
      gl.uniform3fv(this.uGround.uFog, FOG); gl.uniform3fv(this.uGround.uCamPos, this.eye);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texGround); gl.uniform1i(this.uGround.uTex, 0);
      gl.bindVertexArray(this.groundVao); gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
      gl.useProgram(this.progCube);
      gl.uniformMatrix4fv(this.uCube.uVP, false, vp);
      gl.uniform3fv(this.uCube.uSunDir, this.sunDir);
      gl.uniform3fv(this.uCube.uFog, FOG); gl.uniform3fv(this.uCube.uCamPos, this.eye);
      gl.bindTexture(gl.TEXTURE_2D, this.texAtlas); gl.uniform1i(this.uCube.uAtlas, 0);
      gl.enable(gl.CULL_FACE);
      gl.bindVertexArray(this.cubeVao);
      gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, this.cubeCount);
      const gorillaData = game.phase === 'aiming' ? this.buildGorillaData(game, ui, time) : [];
      if (gorillaData.length) {
        gl.bindVertexArray(this.gorillaVao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.gorillaInstances);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(gorillaData), gl.DYNAMIC_DRAW);
        gl.drawElementsInstanced(gl.TRIANGLES, 36, gl.UNSIGNED_SHORT, 0, gorillaData.length / 9);
        gl.bindVertexArray(this.cubeVao);
      }
      gl.disable(gl.CULL_FACE);
      // Aim assist: predicted trajectory as a dotted glow trail plus an impact marker.
      const aimDots = [];
      let aimPoint = null;
      if (ui.aimAssist && game.phase === 'aiming' && Number.isFinite(ui.angle) && Number.isFinite(ui.power) && ui.power > 0) {
        const { points, hit } = game.predict(ui.angle, ui.power, Number.isFinite(ui.direction) ? ui.direction : 0);
        if (points.length > 1) {
          for (let i = 0; i < points.length; i += 2) aimDots.push(points[i]);
          if (hit && hit !== 'miss') aimPoint = points[points.length - 1];
        }
      }
      const list = this.billboards(game, ui, time, aimPoint);
      aimDots.forEach((p, i) => list.push([p.x, p.y, p.z, 4.5, 4.5, TILE.FIRE, 0, [1, .96, .8, .78 - i / aimDots.length * .45], 0]));
      const depth = item => (item[0] - this.eye[0]) ** 2 + (item[1] - this.eye[1]) ** 2 + (item[2] - this.eye[2]) ** 2;
      list.sort((a, b) => depth(b) - depth(a));
      const data = new Float32Array(list.length * 12);
      list.forEach((b, i) => {
        data.set([b[0], b[1], b[2], b[3], b[4], b[5], b[6], ...b[7], b[8]], i * 12);
      });
      gl.useProgram(this.progBill);
      gl.uniformMatrix4fv(this.uBill.uVP, false, vp);
      gl.uniform3fv(this.uBill.uCamRight, right);
      gl.uniform3fv(this.uBill.uFog, FOG); gl.uniform3fv(this.uBill.uCamPos, this.eye);
      gl.bindTexture(gl.TEXTURE_2D, this.texAtlas); gl.uniform1i(this.uBill.uAtlas, 0);
      gl.bindVertexArray(this.billVao);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.billInstances);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
      gl.drawElementsInstanced(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0, list.length);
      gl.depthMask(true); gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }
  }
  root.Gorilla3DRenderer = Renderer3D;
})(globalThis);
