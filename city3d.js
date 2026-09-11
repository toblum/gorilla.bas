/* Small, batched WebGL renderer. Static city geometry is uploaded only after damage. */
(() => {
  'use strict';
  const { CELL, SUN, occupied, launchVector, cityBounds, windsockSites, windPose } = window.Gorillas3D;
  const { CameraRig, ImpactReplay } = window.GorillaView3D;
  const palette = ['#678781', '#c68e77', '#c6bda3', '#587080', '#a5b5a0'];
  const playerColors = ['#fa8650', '#bce0bd'];
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255);
  const norm = v => { const d = Math.hypot(...v) || 1; return v.map(n => n / d); };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const dot = (a, b) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) out[col * 4 + row] += a[k * 4 + row] * b[col * 4 + k];
    return out;
  }
  function matrix(eye, target, aspect) {
    const z = norm(eye.map((n, i) => n - target[i])), x = norm(cross([0, 1, 0], z)), y = cross(z, x);
    const view = new Float32Array([x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0, -dot(x, eye), -dot(y, eye), -dot(z, eye), 1]);
    const f = 1 / Math.tan(Math.PI / 8), near = 2, far = 3500;
    const projection = new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, 2 * far * near / (near - far), 0]);
    return multiply(projection, view);
  }
  class Mesh {
    constructor() { this.data = []; }
    quad(a, b, c, d, color, normal) {
      const col = Array.isArray(color) ? color : rgb(color);
      const n = normal || norm(cross(b.map((v, i) => v - a[i]), c.map((v, i) => v - a[i])));
      for (const p of [a, b, c, a, c, d]) this.data.push(...p, ...n, ...col);
    }
    appendRotated(mesh, origin, heading, scale = 1) {
      const co = Math.sin(heading), si = Math.cos(heading);
      for (let i = 0; i < mesh.data.length; i += 9) {
        const a = mesh.data;
        this.data.push(origin[0] + (a[i] * co + a[i+2] * si) * scale, origin[1] + a[i+1] * scale, origin[2] + (-a[i] * si + a[i+2] * co) * scale,
          a[i+3] * co + a[i+5] * si, a[i+4], -a[i+3] * si + a[i+5] * co, a[i+6], a[i+7], a[i+8]);
      }
    }
    box(x, y, z, w, h, d, color, faces = [true, true, true, true, true, true]) {
      const X = x + w, Y = y + h, Z = z + d;
      if (faces[0]) this.quad([x,y,Z],[X,y,Z],[X,Y,Z],[x,Y,Z],color,[0,0,1]);
      if (faces[1]) this.quad([X,y,z],[x,y,z],[x,Y,z],[X,Y,z],color,[0,0,-1]);
      if (faces[2]) this.quad([X,y,Z],[X,y,z],[X,Y,z],[X,Y,Z],color,[1,0,0]);
      if (faces[3]) this.quad([x,y,z],[x,y,Z],[x,Y,Z],[x,Y,z],color,[-1,0,0]);
      if (faces[4]) this.quad([x,Y,Z],[X,Y,Z],[X,Y,z],[x,Y,z],color,[0,1,0]);
      if (faces[5]) this.quad([x,y,z],[X,y,z],[X,y,Z],[x,y,Z],color,[0,-1,0]);
    }
    line(a, b, width, color) {
      const direction = norm(b.map((n, i) => n - a[i]));
      const side = norm(cross(direction, Math.abs(direction[1]) > .95 ? [1,0,0] : [0,1,0])).map(n => n * width / 2);
      const up = norm(cross(direction, side)).map(n => n * width / 2);
      const corners = p => [[1,1],[-1,1],[-1,-1],[1,-1]].map(([s,t]) => p.map((n,i) => n + side[i]*s + up[i]*t));
      const A = corners(a), B = corners(b);
      for (let i = 0; i < 4; i++) this.quad(A[i], A[(i+1)%4], B[(i+1)%4], B[i], color);
    }
    sphere(x, y, z, radius, color, emissive = false) {
      for (let j = 0; j < 6; j++) for (let i = 0; i < 12; i++) {
        const p = (a,b) => [x + Math.sin(b*Math.PI/6)*Math.cos(a*Math.PI/6)*radius, y + Math.cos(b*Math.PI/6)*radius, z + Math.sin(b*Math.PI/6)*Math.sin(a*Math.PI/6)*radius];
        this.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),color,emissive ? [0,0,0] : undefined);
      }
    }
  }
  class City3D {
    constructor(canvas, hud) {
      this.canvas = canvas; this.hud = hud; this.ctx = hud.getContext('2d');
      const gl = this.gl = canvas.getContext('webgl', { antialias: true, alpha: true, powerPreference: 'low-power' });
      if (!gl) throw new Error('WebGL ist in diesem Browser nicht verfügbar. Bitte aktiviere Hardwarebeschleunigung oder wähle 2D.');
      const shader = (type, source) => { const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const vs = shader(gl.VERTEX_SHADER, 'attribute vec3 aPosition; attribute vec3 aNormal; attribute vec3 aColor; uniform mat4 uMatrix; uniform vec3 uEye; varying vec3 vColor; varying float vFog; void main(){ gl_Position=uMatrix*vec4(aPosition,1.0); float light=length(aNormal)<0.1?1.2:0.62+max(0.0,dot(aNormal,normalize(vec3(-0.6,1.0,0.4))))*0.48; vColor=aColor*light; vFog=smoothstep(1000.0,2800.0,distance(aPosition,uEye))*0.97; }');
      const fs = shader(gl.FRAGMENT_SHADER, 'precision mediump float; varying vec3 vColor; varying float vFog; void main(){gl_FragColor=vec4(mix(vColor,vec3(0.73,0.77,0.75),vFog),1.0);}');
      this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs); gl.deleteShader(fs); gl.useProgram(this.program);
      this.attributes = ['aPosition', 'aNormal', 'aColor'].map(n => gl.getAttribLocation(this.program, n));
      this.uMatrix = gl.getUniformLocation(this.program, 'uMatrix'); this.uEye = gl.getUniformLocation(this.program, 'uEye');
      this.staticBuffer = gl.createBuffer(); this.dynamicBuffer = gl.createBuffer();
      gl.enable(gl.DEPTH_TEST); gl.clearColor(0,0,0,0);
      this.camera = new CameraRig(); this.clock = 0; this.cachedGame = null; this.revision = -1; this.lost = false;
      this.replayPanel = document.createElement('section');
      this.replayPanel.className = 'replay-panel'; this.replayPanel.hidden = true;
      this.replayPanel.setAttribute('aria-label','Einschlag-Replay in Zeitlupe');
      this.replayPanel.innerHTML = '<div class="replay-heading"><span>↶ EINSCHLAG · REPLAY</span><button type="button" aria-label="Replay schließen" title="Replay überspringen">×</button></div><div class="replay-progress"><span></span></div>';
      canvas.parentElement.append(this.replayPanel);
      this.replayPanel.querySelector('button').addEventListener('click',()=>this.closeReplay());
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; document.getElementById('view-status').textContent = '3D-Grafik unterbrochen. Bitte neu laden oder über Neues Match zu 2D wechseln.'; });
      canvas.addEventListener('pointerdown', e => { if (e.button !== 0) return; this.drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', e => { if (!this.drag || this.drag.id !== e.pointerId) return; this.camera.orbit(-(e.clientX-this.drag.x)*.006,(e.clientY-this.drag.y)*.004); this.drag.x=e.clientX;this.drag.y=e.clientY; });
      const end = () => { this.drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
      canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.08 : 1/1.08); }, { passive: false });
      canvas.addEventListener('keydown', e => {
        if (e.key === 'a' || e.key === 'd') { this.camera.orbit(e.key === 'a' ? .1 : -.1,0); e.preventDefault(); }
        if (e.key === '+' || e.key === '-') { this.zoom(e.key === '+' ? .9 : 1.1); e.preventDefault(); }
        if (e.key === 'Home') { this.resetCamera(); e.preventDefault(); }
      });
    }
    resetCamera() { this.camera.overview(); }
    zoom(factor) { this.camera.zoom(factor); }
    playerCamera(game) { this.camera.behind(game); }
    tree(m,x,z,size=1) {
      m.box(x-1.5,1,z-1.5,3,12*size,3,'#756653');
      m.box(x-8*size,9*size,z-8*size,16*size,12*size,16*size,'#65846b');
      m.box(x-6*size,20*size,z-6*size,12*size,7*size,12*size,'#90a77a');
    }
    pine(m,x,z,size) {
      m.box(x-1.4,0,z-1.4,2.8,17*size,2.8,'#756653');
      for(let tier=0;tier<3;tier++){
        const y=(7+tier*9)*size,r=(12-tier*2.5)*size,top=[x,y+19*size,z];
        for(let i=0;i<6;i++){
          const a=i*Math.PI/3,b=(i+1)*Math.PI/3;
          m.quad([x+Math.cos(a)*r,y,z+Math.sin(a)*r],[x+Math.cos(b)*r,y,z+Math.sin(b)*r],top,top,['#547861','#62836a','#789477'][tier]);
        }
      }
    }
    landscape(m,{left,right,back,front}) {
      const hash=n=>{const h=Math.sin(n*127.1+37.7)*43758.5453;return h-Math.floor(h);};
      const pond={x:left-175,z:front-190,rx:83,rz:51};
      const oval=(x,z,rx,rz,y,color)=>{
        for(let i=0;i<24;i++){
          const a=i*Math.PI/12,b=(i+1)*Math.PI/12;
          m.quad([x,y,z],[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],[x,y,z],color,[0,1,0]);
        }
      };
      // Overlapping groves give the outskirts a natural outline, with open meadows between them.
      const groves=[
        [left-150,back+70,145,160],[left-240,(back+front)/2,195,220],
        [left-260,front-170,155,140],[right+150,back+90,150,175],
        [right+220,(back+front)/2,190,220],[right+145,front-140,125,110],
        [left+100,back-170,200,145],[right-140,back-170,225,155],
        [left-180,back-210,250,150],[right+160,back-220,240,160]
      ];
      groves.forEach(([cx,cz,rx,rz],grove)=>{
        oval(cx,cz,rx,rz,-.6,grove%2?'#90a483':'#94a889');
        for(let i=0;i<44;i++){
          const seed=grove*101+i,a=hash(seed+15)*Math.PI*2,r=Math.sqrt(hash(seed+507));
          const x=cx+Math.cos(a)*r*rx,z=cz+Math.sin(a)*r*rz;
          if((x>left-25&&x<right+25&&z>back-25)||Math.abs(x)<22||z>front-36)continue;
          if(Math.abs(x-(left-64))<14||Math.abs(x-(right+64))<14||Math.abs(z-(back-60))<14)continue;
          if(((x-pond.x)/(pond.rx+20))**2+((z-pond.z)/(pond.rz+20))**2<1)continue;
          const size=.85+hash(seed+901)*.75;
          if(i%3)this.pine(m,x,z,size);else this.tree(m,x,z,size);
        }
      });
      // Walking paths connect the promenade, woodland and lakeside clearing.
      const paths=[[[left-64,front-18],[left-64,back-60]],[[right+64,front-18],[right+64,back-60]],
        [[left-64,back-60],[right+64,back-60]],[[left-64,pond.z+68],[pond.x,pond.z+68]]];
      for(const [a,b] of paths)m.line([a[0],.1,a[1]],[b[0],.1,b[1]],5,'#c4b997');
      oval(pond.x,pond.z,pond.rx+8,pond.rz+8,-.1,'#bac09a');
      oval(pond.x,pond.z,pond.rx,pond.rz,.05,'#76a8a0');
      oval(pond.x-12,pond.z-6,pond.rx*.66,pond.rz*.65,.07,'#80afa4');
      for(let i=0;i<12;i++){
        const a=i*Math.PI/6,x=pond.x+Math.cos(a)*(pond.rx+5),z=pond.z+Math.sin(a)*(pond.rz+5);
        m.box(x,0,z,4+i%3,3+i%4,4,'#a5ae98');
        for(let j=0;j<3;j++)m.line([x+5+j,0,z+3],[x+5+j,5+j*2,z+4],.8,'#7d956b');
      }
      m.box(pond.x-6,.2,pond.z+32,12,1.6,28,'#a38c6c');
      for(let i=0;i<3;i++){
        const x=pond.x-32+i*27,z=pond.z+77;
        m.box(x,5,z,13,1.5,8,'#ab8b65');
        for(const dx of [2,10])m.box(x+dx,0,z+1,1.5,5,6,'#7f7159');
        for(const dz of [-4,10])m.box(x,2.5,z+dz,13,1.5,3,'#ab8b65');
      }
      // A small beach pavilion and timber sun shelters break up the coastal road.
      const hutX=right+42,hutZ=front+3;
      m.box(hutX,0,hutZ,25,14,20,'#c2ac83');m.box(hutX-3,14,hutZ-3,31,3,26,'#6f8880');
      m.box(hutX+4,4,hutZ+20.1,17,7,.2,'#527679');
      for(let i=0;i<3;i++){
        const x=right+94+i*34;
        for(const dx of [0,20])for(const dz of [0,17])m.box(x+dx,0,front+dz,1.5,17,1.5,'#a18c6b');
        for(let n=0;n<7;n++)m.box(x-2,17,front-2+n*3.5,25,1.5,2,'#d0bb8f');
      }
    }
    staticCity(game) {
      const m = new Mesh();
      const bounds = cityBounds(game), { left, right, back, front, shore } = bounds;
      this.windSites = windsockSites(game);
      // The city sits in a continuous coastal landscape, rather than on a floating slab.
      // Tessellation keeps distance haze smooth across the landscape, without visible slab edges.
      for(let x=-6000;x<6000;x+=300)for(let z=-6000;z<shore;z+=300){
        const end=Math.min(shore,z+300);
        m.quad([x,-1,z],[x,-1,end],[x+300,-1,end],[x+300,-1,z],'#98aa8a',[0,1,0]);
      }
      for(let x=-6000;x<6000;x+=300){
        m.quad([x,0,shore],[x,0,shore+44],[x+300,0,shore+44],[x+300,0,shore],'#d5bd90',[0,1,0]);
        for(let z=shore+44;z<6000;z+=300)m.quad([x,-2,z],[x,-2,z+300],[x+300,-2,z+300],[x+300,-2,z],'#78a9ab',[0,1,0]);
      }
      m.box(left,-1,back,right-left,2,front-back,'#637472');
      // Boulevards continue out into the surrounding landscape.
      m.box(-1800,.05,front-18,3600,.4,18,'#76837b');
      m.box(-12,.05,-1800,22,.4,1800+back,'#76837b');
      m.box(left,1,front,right-left,3,shore-front,'#c9ba98');
      m.box(left,1,shore-3,right-left,5,3,'#dbcca9');
      m.box(left+8,4,front+10,right-left-16,.2,2,'#e9d9b1');
      for(let i=0;i<95;i++) {
        const x=-1400+(i*157)%2800,z=shore+53+(i*59)%850;
        m.box(x,-1.8,z,18+(i%5)*12,.15,1.4,'#bad0c3');
      }
      this.landscape(m,bounds);
      const columns=[...new Set(game.plots.map(p=>p.x))].sort((a,b)=>a-b),rows=[...new Set(game.plots.map(p=>p.z))].sort((a,b)=>a-b);
      for(const x0 of columns.slice(0,-1)) {
        const x=x0+82;
        for(let z=back;z<front;z+=20)m.box(x,1.05,z,1,.1,9,'#dfd0a1');
        for(const z of rows)for(let n=0;n<4;n++)m.box(x-7,1.1,z-9+n*3,15,.1,1.4,'#ebe2c8');
      }
      for(const z of rows.slice(0,-1))for(let x=left;x<right;x+=22)m.box(x,1.05,z+82,10,.1,1,'#dfd0a1');
      for(const p of game.plots) {
        m.box(p.x-3,1,p.z-3,78,2,78,'#c1b9a0');
        if(p.kind==='park') {
          m.box(p.x,3,p.z,72,.7,72,'#839a73');
          m.box(p.x+31,3.8,p.z,10,.2,72,'#d7c9a6'); m.box(p.x,3.8,p.z+31,72,.2,10,'#d7c9a6');
          for(const [dx,dz] of [[13,12],[58,14],[13,57],[57,57]]) this.tree(m,p.x+dx,p.z+dz,.8+(p.seed%4)*.12);
          m.box(p.x+19,4,p.z+25,10,2,3,'#866449');m.box(p.x+19,6,p.z+27,10,4,1,'#866449');
        } else if(p.kind==='plaza') {
          m.box(p.x+17,3,p.z+17,38,2,38,'#d9ccaf'); m.box(p.x+22,5,p.z+22,28,1,28,'#7dafb0');
          m.box(p.x+32,6,p.z+32,8,17,8,'#c3cbbb'); m.sphere(p.x+36,26,p.z+36,5,'#dfd6b8');
        }
      }
      // Ground shadows are baked and rebuilt alongside damaged architecture.
      for(const b of game.buildings) {
        const length=b.height*.5;
        m.quad([b.x,3.05,b.z],[b.x+b.width,3.05,b.z],[b.x+b.width+length,3.05,b.z-length*.6],[b.x+length,3.05,b.z-length*.6],'#586e68',[0,1,0]);
      }
      for(const b of game.buildings) this.building(m,b);
      for(let x=left+18;x<right-20;x+=53) {
        this.tree(m,x,front+17,.6);
        m.box(x+12,4,front+7,10,2.5,3,'#8a7257');m.box(x+12,6.5,front+9,10,4,1,'#8a7257');
      }
      for(let i=0;i<24;i++) {
        const x=columns[i%(columns.length-1)]+77,z=rows[i%rows.length]-18+(i%3)*11;
        const color=['#d9b15f','#b5c7b6','#c47760','#d7d2be'][i%4];
        m.box(x,1.5,z,6,4,12,color);m.box(x+.5,5.5,z+3,5,3,6,'#526d75');
        m.box(x-.6,2,z+2,1,2,2,'#38464a');m.box(x+5.6,2,z+8,1,2,2,'#38464a');
      }
      for(const x of columns){m.box(x-14,3,back+12,1,23,1,'#546965');m.box(x-15,26,back+11,6,1.5,3,'#ffe1a2');}
      const pierX=right-100;
      m.box(pierX,-.5,shore-1,24,3,106,'#947d60');
      for(let z=shore+2;z<shore+104;z+=6)m.box(pierX,2.6,z,24,.3,.7,'#d6be94');
      m.box(pierX+41,-3,shore+70,16,6,34,'#ece0be');m.box(pierX+43,3,shore+76,12,7,18,'#d39a77');m.box(pierX+44,10,shore+78,10,1,14,'#efe6cd');
      this.staticCount = this.upload(this.staticBuffer,m,this.gl.STATIC_DRAW);
    }
    building(m,b) {
      const C=CELL, col=rgb(palette[b.color]);
      for(let y=0;y<b.ny;y++) for(let z=0;z<b.nz;z++) for(let x=0;x<b.nx;x++) {
        if(!occupied(b,x,y,z)) continue;
        const faces=[[0,0,1],[0,0,-1],[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].map(([dx,dy,dz])=>!occupied(b,x+dx,y+dy,z+dz));
        if(!faces.some(Boolean)) continue;
        const X=b.x+x*C,Y=y*C,Z=b.z+z*C;
        const tint=((x*7+z*13+y*3+b.seed)%11===0) ? col.map(v=>v*.95) : col;
        m.box(X,Y,Z,C,C,C,tint,faces);
        const light=(x*11+z*7+y*3+b.seed)%9<3, window=light?'#f8dba0':'#3d5961';
        const yy=Y+2,top=Y+6;
        if(faces[0]&&z===b.nz-1)m.quad([X+2,yy,Z+C+.03],[X+5,yy,Z+C+.03],[X+5,top,Z+C+.03],[X+2,top,Z+C+.03],window,[0,0,1]);
        if(faces[1]&&z===0)m.quad([X+5,yy,Z-.03],[X+2,yy,Z-.03],[X+2,top,Z-.03],[X+5,top,Z-.03],window,[0,0,-1]);
        if(faces[2]&&x===b.nx-1)m.quad([X+C+.03,yy,Z+2],[X+C+.03,yy,Z+5],[X+C+.03,top,Z+5],[X+C+.03,top,Z+2],window,[1,0,0]);
        if(faces[3]&&x===0)m.quad([X-.03,yy,Z+5],[X-.03,yy,Z+2],[X-.03,top,Z+2],[X-.03,top,Z+5],window,[-1,0,0]);
        if(faces[4]&&y===b.ny-1)m.box(X,Y+C+.04,Z,C,.3,C,'#c3c4ad',[false,false,false,false,true,false]);
      }
      // Roof details sit only on intact roof voxels, including after explosions.
      if(occupied(b,1,b.ny-1,1)) { m.box(b.x+9,b.height+1,b.z+9,6,4,6,'#80928b');m.box(b.x+9,b.height+5,b.z+9,6,1,6,'#b4bca8'); }
      if(b.player===undefined && occupied(b,b.nx-2,b.ny-1,b.nz-2)) m.box(b.x+b.width-12,b.height,b.z+b.depth-12,1,16,1,'#526960');
    }
    sun(m,game,eye,time,reduced) {
      const centre=[SUN.x,SUN.y,SUN.z],f=norm(eye.map((v,i)=>v-centre[i]));
      const right=norm(cross([0,1,0],f)),up=cross(f,right);
      const point=(x,y,z)=>centre.map((v,i)=>v+right[i]*x+up[i]*y+f[i]*z);
      m.sphere(...centre,SUN.radius,game.sunHit?'#fff5b0':'#ffda83',true);
      // A corona of solid, tapered rays. Face and corona face the camera while remaining in world space.
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6+(reduced?0:Math.sin(time/9000)*.035),len=i%2?10:15;
        const radial=(r,offset=0)=>point(Math.cos(a)*r-Math.sin(a)*offset,Math.sin(a)*r+Math.cos(a)*offset,-2);
        const A=radial(SUN.radius+4),B=radial(SUN.radius+8,2.5),C=radial(SUN.radius+4+len),D=radial(SUN.radius+8,-2.5);
        const ridge=point(Math.cos(a)*(SUN.radius+8),Math.sin(a)*(SUN.radius+8),2);
        m.quad(A,B,C,ridge,'#ffd77c',[0,0,0]);m.quad(A,ridge,C,D,'#efb65e',[0,0,0]);
      }
      const facePoint=(x,y)=>point(x,y,Math.sqrt(Math.max(0,SUN.radius**2-x*x-y*y))+.65);
      // Raised, smiling eyes and a curved mouth read clearly even at the overview scale.
      for(const eyeX of [-8,8])for(let j=0;j<5;j++){
        const a=j/5,b=(j+1)/5;
        m.line(facePoint(eyeX-2.7+a*5.4,3+Math.sin(a*Math.PI)*2),facePoint(eyeX-2.7+b*5.4,3+Math.sin(b*Math.PI)*2),1.8,'#885734');
      }
      if(game.sunHit) {
        for(let j=0;j<12;j++){const a=j*Math.PI/6,b=(j+1)*Math.PI/6;m.line(facePoint(Math.cos(a)*3.2,-6+Math.sin(a)*4),facePoint(Math.cos(b)*3.2,-6+Math.sin(b)*4),1.8,'#885734');}
      } else for(let j=0;j<10;j++){
        const a=j/10,b=(j+1)/10;
        m.line(facePoint(-9+a*18,-4-Math.sin(a*Math.PI)*5),facePoint(-9+b*18,-4-Math.sin(b*Math.PI)*5),1.8,'#885734');
      }
      for(const x of [-13,13])m.sphere(...facePoint(x,-2),2.5,'#efac68',true);
    }
    windsock(destination,site,wind,windZ,time,reduced) {
      const m=new Mesh(),x=0,y=0,z=0,pose=windPose(wind,windZ),stretch=pose.extension;
      m.box(x-2,y,z-2,4,2,4,'#d4c7a7');m.line([x,y+1,z],[x,y+34,z],1.4,'#67746d');
      m.sphere(x,y+34,z,1.7,'#e8d8b5');
      const length=17+stretch*20;
      const axis=norm([pose.x*stretch,-(1-stretch)*.85,pose.z*stretch]);
      const side=norm(cross(axis,Math.abs(axis[1])>.95?[1,0,0]:[0,1,0])),up=norm(cross(side,axis));
      const ring=(t,a)=>{
        const flutter=reduced?0:Math.sin(time/170+t*9+site.x*.03)*1.7*stretch*t*t;
        const radius=4.3*(1-t*.67),sag=(1-stretch)*t*t*5;
        return [x+axis[0]*length*t+side[0]*flutter+side[0]*Math.cos(a)*radius+up[0]*Math.sin(a)*radius,
          y+32+axis[1]*length*t-sag+side[1]*flutter+side[1]*Math.cos(a)*radius+up[1]*Math.sin(a)*radius,
          z+axis[2]*length*t+side[2]*flutter+side[2]*Math.cos(a)*radius+up[2]*Math.sin(a)*radius];
      };
      // Open-ended cloth cone, with five red/white bands and a metal mouth ring.
      for(let band=0;band<5;band++)for(let i=0;i<10;i++){
        const a=i*Math.PI/5,b=(i+1)*Math.PI/5;
        m.quad(ring(band/5,a),ring(band/5,b),ring((band+1)/5,b),ring((band+1)/5,a),band%2?'#fff2d7':'#df6249');
        if(band===0)m.line(ring(0,a),ring(0,b),.6,'#f2dcc2');
      }
      destination.appendRotated(m,[site.x,site.y,site.z],Math.PI/2,site.scale);
    }
    flag(destination,site,wind,windZ,time,reduced) {
      const m=new Mesh(),pose=windPose(wind,windZ),stretch=pose.extension;
      const dx=pose.speed?pose.x:1,dz=pose.speed?pose.z:0;
      m.box(-2,0,-2,4,2,4,'#d4c7a7');m.line([0,1,0],[0,34,0],1.4,'#67746d');m.sphere(0,34,0,1.7,'#e8d8b5');
      const point=(u,v)=>{
        const wave=reduced?0:Math.sin(time/190-u*8+site.x*.03)*u*2.4*stretch;
        const length=u*(3+stretch*24);
        return [dx*length-dz*wave,31-v*12-(1-stretch)*u*14, dz*length+dx*wave];
      };
      for(let col=0;col<9;col++)for(let row=0;row<4;row++)m.quad(point(col/9,row/4),point((col+1)/9,row/4),point((col+1)/9,(row+1)/4),point(col/9,(row+1)/4),row<2?'#fff2d7':'#df6249');
      destination.appendRotated(m,[site.x,site.y,site.z],Math.PI/2,site.scale);
    }
    banana(m,s) {
      for(let i=1;i<(s.trail?.length||0);i++) { const a=s.trail[i-1],b=s.trail[i];m.line([a.x,a.y,a.z],[b.x,b.y,b.z],.5+i/s.trail.length*1.3,s.charged?'#fff8b5':'#f7d492'); }
      const rot=s.time*9;
      for(let i=0;i<5;i++) {const a=i*.5-1,xx=Math.cos(a)*5-3,yy=Math.sin(a)*5;m.box(s.x+xx*Math.cos(rot)-yy*Math.sin(rot)-1,s.y+xx*Math.sin(rot)+yy*Math.cos(rot)-1,s.z-1,2.8,2.8,2.8,i===0?'#907144':'#ffe17a');}
    }
    explosion(m,hit,reduced) {
      const t=hit.age;
      if(t<0||t>=1.7)return;
      if(t<.35)m.sphere(hit.x,hit.y,hit.z,hit.radius*Math.sin(Math.min(1,t/.35)*Math.PI/2),t<.12?'#fff2b0':'#f2a154',true);
      if(!reduced)for(let i=0;i<18;i++) { const a=i*2.399,r=hit.radius*(.6+t*2),x=hit.x+Math.cos(a)*r,z=hit.z+Math.sin(a)*r,y=hit.y+10+t*(25+i%5*8)-t*t*35,size=Math.max(.1,(1-t/1.7)*(i%3+1));m.box(x,y,z,size,size,size,i%3?'#dcac77':'#65706a'); }
    }
    closeReplay() {
      if(this.replay)this.gl.deleteBuffer(this.replay.beforeBuffer);
      this.replay=null;this.replayPanel.hidden=true;
    }
    observeReplay(game) {
      if(this.cachedGame!==game||this.replay?.round!==game.round||game.options.replay===false||game.phase==='flying')this.closeReplay();
      if(game.phase!=='impact'||this.seenImpact===game.impact)return;
      this.seenImpact=game.impact;
      if(game.options.replay===false||!game.shot||this.cachedGame!==game||game.impact.age>.2)return;
      this.closeReplay();
      this.replay={clip:new ImpactReplay(game.shot,game.impact,game.wind,game.options.gravity,game.windZ),start:this.clock,round:game.round,
        beforeBuffer:this.staticBuffer,beforeCount:this.staticCount,gorillas:game.gorillas.map((g,i)=>({...g,alive:g.alive||(game.impact.type==='gorilla'&&game.impact.player===i)}))};
      // Preserve the pre-impact GPU buffer. The normal rebuild creates the damaged version once.
      this.staticBuffer=this.gl.createBuffer();this.replayPanel.hidden=false;
    }
    drawReplay(game,reduced,ratio) {
      const replay=this.replay;if(!replay)return;
      const elapsed=(this.clock-replay.start)/1000,frame=replay.clip.frame(elapsed);
      if(frame.done){this.closeReplay();return;}
      const w=Math.min(330,Math.max(170,this.width*.32)),h=Math.round(w*.62),x=this.width-w-14,y=74;
      const gl=this.gl,left=Math.round(x*ratio),bottom=Math.round((this.height-y-h)*ratio),width=Math.round(w*ratio),height=Math.round(h*ratio);
      Object.assign(this.replayPanel.style,{left:`${x}px`,top:`${y-27}px`,width:`${w}px`,height:`${h+30}px`});
      this.replayPanel.querySelector('.replay-progress span').style.width=`${frame.progress*100}%`;
      const clip=replay.clip,impactAge=reduced ? .28 : frame.impactAge,mesh=new Mesh();
      replay.gorillas.forEach((g,i)=>{if(impactAge<0||clip.hit.type!=='gorilla'||clip.hit.player!==i)this.gorilla(mesh,g,i,0,false,true);});
      if(impactAge<0)this.banana(mesh,{...frame.point,time:elapsed*1.65,charged:clip.shot.charged});
      else this.explosion(mesh,{...clip.hit,age:impactAge},reduced);
      this.ctx.clearRect(x-2,y-28,w+4,h+34);
      gl.enable(gl.SCISSOR_TEST);gl.scissor(left,bottom,width,height);gl.viewport(left,bottom,width,height);
      gl.clearColor(.70,.76,.73,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.clearColor(0,0,0,0);
      gl.uniformMatrix4fv(this.uMatrix,false,matrix(clip.eye,clip.target,w/h));gl.uniform3fv(this.uEye,clip.eye);
      this.renderBuffer(impactAge<0?replay.beforeBuffer:this.staticBuffer,impactAge<0?replay.beforeCount:this.staticCount);
      this.renderBuffer(this.dynamicBuffer,this.upload(this.dynamicBuffer,mesh,gl.DYNAMIC_DRAW));
      gl.disable(gl.SCISSOR_TEST);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    }
    gorilla(destination,g,player,time,celebrate,reduced) {
      if(!g.alive)return;
      const m=new Mesh();
      const c=playerColors[player], dark=player===0?'#98553d':'#637e68', face=player===0?'#fbc391':'#e2e4b9';
      const bounce=celebrate&&!reduced?Math.abs(Math.sin(time/140))*2:0, x=0,y=bounce,z=0;
      m.box(x-8,y,z-5,6,6,10,dark);m.box(x+2,y,z-5,6,6,10,dark);
      m.box(x-9,y+6,z-6,18,14,12,c);m.box(x-7,y+9,z+6.1,14,8,1,face);
      m.box(x-7,y+20,z-5,14,9,10,c);m.box(x-5,y+21,z+5,10,5,1,face);
      m.box(x-3.5,y+24,z+6.1,2,1.7,.6,'#283c41');m.box(x+1.5,y+24,z+6.1,2,1.7,.6,'#283c41');
      m.box(x-2,y+21.5,z+6.2,4,1,.5,dark);
      // Also model the back of the head, ears and low, massive shoulders.
      m.box(x-8,y+22,z-2,2,4,4,dark);m.box(x+6,y+22,z-2,2,4,4,dark);
      for(const side of [-1,1]) {
        const raised=celebrate&&(reduced||Math.sin(time/160+side)>-.3);
        m.box(x+(side<0?-15:9),y+(raised?16:9),z-5,6,11,10,c);
        m.box(x+(side<0?-16:10),y+(raised?24:3),z-5,6,7,11,dark);
      }
      destination.appendRotated(m,[g.x,g.y,g.z],g.heading??player*Math.PI);
    }
    upload(buffer,mesh,usage) { const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),usage);return mesh.data.length/9; }
    renderBuffer(buffer,count) {
      this.drawCalls++;
      const gl=this.gl;gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      this.attributes.forEach((loc,i)=>{gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,3,gl.FLOAT,false,36,i*12);});
      gl.drawArrays(gl.TRIANGLES,0,count);
    }
    project(x,y,z) {
      const m=this.mvp, w=m[3]*x+m[7]*y+m[11]*z+m[15];
      return {x:((m[0]*x+m[4]*y+m[8]*z+m[12])/w*.5+.5)*this.width,y:(.5-(m[1]*x+m[5]*y+m[9]*z+m[13])/w*.5)*this.height,visible:w>0};
    }
    draw(game,time,aim,reduced,paused=false) {
      this.drawCalls=0;
      if(this.lost)return;
      const width=this.canvas.clientWidth,height=this.canvas.clientHeight;
      if(!width||!height)return;
      const ratio=Math.min(window.devicePixelRatio||1,1.75);
      if(this.canvas.width!==Math.round(width*ratio)||this.canvas.height!==Math.round(height*ratio)) { this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);this.hud.width=this.canvas.width;this.hud.height=this.canvas.height; }
      this.width=width;this.height=height;this.ctx.setTransform(ratio,0,0,ratio,0,0);
      this.clock+=paused?0:Math.max(0,Math.min(50,time-(this.lastTime??time)));this.lastTime=time;
      const pose=this.camera.update(game,this.clock,reduced),dist=pose.distance*Math.max(1,1.45/(width/height));
      const eye=[pose.target[0]+Math.sin(pose.yaw)*Math.cos(pose.pitch)*dist,pose.target[1]+Math.sin(pose.pitch)*dist,pose.target[2]+Math.cos(pose.yaw)*Math.cos(pose.pitch)*dist];
      this.mvp=matrix(eye,pose.target,width/height);
      const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uMatrix,false,this.mvp);gl.uniform3fv(this.uEye,eye);
      this.observeReplay(game);
      if(this.cachedGame!==game||this.revision!==game.revision) { this.staticCity(game);this.cachedGame=game;this.revision=game.revision; }
      this.renderBuffer(this.staticBuffer,this.staticCount);
      const m=new Mesh();
      this.sun(m,game,eye,time,reduced);
      for(const site of this.windSites)this[site.type==='flag'?'flag':'windsock'](m,site,game.wind,game.windZ,time,reduced);
      game.setAim(aim.angle,aim.direction);
      game.gorillas.forEach((g,p)=>{
        this.gorilla(m,g,p,time,game.winner===p&&game.phase!=='impact',reduced);
        if(g.alive)for(let i=0;i<16;i++){const a=i*Math.PI/8,b=a+.12;m.line([g.x+Math.cos(a)*21,g.y+.8,g.z+Math.sin(a)*21],[g.x+Math.cos(b)*21,g.y+.8,g.z+Math.sin(b)*21],1,playerColors[p]);}
      });
      if(game.phase==='aiming'&&game.options.aimAssist&&[aim.angle,aim.power,aim.direction].every(Number.isFinite)) {
        const g=game.gorillas[game.turn],v=launchVector(game.turn,aim.angle,1,aim.direction),len=18+aim.power*.35;
        const a=[g.x,g.y+34,g.z],b=[a[0]+v.vx*len,a[1]+v.vy*len,a[2]+v.vz*len];
        m.line(a,b,1.8,playerColors[game.turn]);m.sphere(...b,3,playerColors[game.turn]);
      }
      const s=game.shot;
      if(s&&game.phase==='flying')this.banana(m,s);
      if(game.impact)this.explosion(m,game.impact,reduced);
      const count=this.upload(this.dynamicBuffer,m,gl.DYNAMIC_DRAW);this.renderBuffer(this.dynamicBuffer,count);
      this.drawHUD(game,aim);
      this.drawReplay(game,reduced,ratio);
    }
    drawHUD(game,aim) {
      const c=this.ctx,w=this.width,h=this.height;c.clearRect(0,0,w,h);
      for(let i=0;i<2;i++) {
        const g=game.gorillas[i];if(!g.alive)continue;
        const p=this.project(g.x,g.y+64,g.z), tip=this.project(g.x,g.y+32,g.z);if(!p.visible)continue;
        const name=game.options.names[i], active=game.turn===i&&game.phase==='aiming';
        const text=w<500 ? name.slice(0,10)+(name.length>10?'…':'')+(active?' ◀':'') : name+(active?' · AM WURF':'');
        c.font=`bold ${w<500?9:11}px "Courier New"`;const tw=c.measureText(text).width+16;
        const x=Math.max(tw/2+5,Math.min(w-tw/2-5,p.x)),y=Math.max(75,Math.min(h-80,p.y));
        c.fillStyle='#263e46';c.fillRect(x-tw/2,y-14,tw,23);c.fillStyle=playerColors[i];c.fillRect(x-tw/2,y-14,3,23);c.textAlign='center';c.fillText(text,x,y+1);
        c.strokeStyle=playerColors[i];c.lineWidth=1;c.beginPath();c.moveTo(x,y+9);c.lineTo(tip.x,tip.y);c.stroke();
      }
      const s=game.shot;
      if(s&&game.phase==='flying') {
        const p=this.project(s.x,s.y,s.z);const on=p.visible&&p.x>15&&p.x<w-15&&p.y>60&&p.y<h-20;
        if(on){c.beginPath();c.arc(p.x,p.y,9,0,Math.PI*2);c.strokeStyle='#fff2b9';c.lineWidth=1.5;c.stroke();}
        else {c.fillStyle='#263e46';c.fillRect(w/2-112,58,224,25);c.fillStyle='#ffdf91';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(`BANANE ↗ ${Math.round(s.y)} m HÖHE`,w/2,75);}
      }
      // A north-up tactical map makes depth, azimuth and wind readable regardless of camera rotation.
      const mw=w<500?108:145,mh=mw*.72,mx=w-mw-14,my=h-mh-14,bounds=cityBounds(game),scale=Math.min((mw-16)/(bounds.right-bounds.left),(mh-16)/(bounds.front-bounds.back));
      c.fillStyle='#233b43ed';c.fillRect(mx,my,mw,mh);c.strokeStyle='#d3c9a24d';c.strokeRect(mx+.5,my+.5,mw-1,mh-1);
      const map=(x,z)=>[mx+mw/2+(x-(bounds.left+bounds.right)/2)*scale,my+mh/2+(z-(bounds.front+bounds.back)/2)*scale];
      for(const p of game.plots) {const [x,z]=map(p.x,p.z);c.fillStyle=p.kind==='park'?'#789d7d':'#839595';c.fillRect(x,z,72*scale,72*scale);}
      const g=game.gorillas[game.turn],v=launchVector(game.turn,0,1,aim.direction||0),[x,z]=map(g.x,g.z);
      c.save();c.beginPath();c.rect(mx,my,mw,mh);c.clip();c.strokeStyle=playerColors[game.turn];c.setLineDash([3,3]);c.beginPath();c.moveTo(x,z);c.lineTo(x+v.vx*85,z+v.vz*85);c.stroke();c.setLineDash([]);c.restore();
      game.gorillas.forEach((g,i)=>{const [x,z]=map(g.x,g.z);c.fillStyle=playerColors[i];c.beginPath();c.arc(x,z,4,0,Math.PI*2);c.fill();});
      if(s){const [x,z]=map(s.x,s.z);if(x>mx&&x<mx+mw&&z>my&&z<my+mh){c.fillStyle='#ffe393';c.fillRect(x-2,z-2,4,4);}}
      c.fillStyle='#233b43';c.fillRect(mx,my-17,mw,17);c.fillStyle='#d8d9bf';c.font='9px "Courier New"';c.textAlign='left';c.fillText('STADTPLAN · N ↑',mx+7,my-5);
    }
  }
  window.GorillaCity3D = City3D;
})();
