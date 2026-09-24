/* Small, batched WebGL renderer. Static city geometry is uploaded only after damage. */
(() => {
  'use strict';
  const { CELL, SUN, occupied, launchVector, cityBounds, windsockSites, windPose } = window.Gorillas3D;
  const { CameraRig, ImpactReplay, AmbientLife, daylight, explosionLight } = window.GorillaView3D;
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
      const points=[a,b,c,d];
      for (const i of [0,1,2,0,2,3]) this.data.push(...points[i], ...(Array.isArray(n[0])?n[i]:n), ...(Array.isArray(col[0])?col[i]:col));
    }
    lamp(x,y,z,w,h,d,color) {
      const start=this.data.length;this.box(x,y,z,w,h,d,color);
      // Length-five normals identify lamps; they become emissive only at dusk.
      for(let i=start;i<this.data.length;i+=9)for(let j=3;j<6;j++)this.data[i+j]*=5;
    }
    lightPool(x,y,z,rx,rz,color='#ffd596') {
      // Interpolated normal length encodes opacity; one small translucent fan.
      for(let i=0;i<12;i++) {
        const a=i*Math.PI/6,b=(i+1)*Math.PI/6;
        this.quad([x,y,z],[x+Math.cos(a)*rx,y,z+Math.sin(a)*rz],[x+Math.cos(b)*rx,y,z+Math.sin(b)*rz],[x,y,z],
          color,[[0,4,0],[0,3,0],[0,3,0],[0,4,0]]);
      }
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
      this.highPrecision=gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER,gl.HIGH_FLOAT).precision>0;
      const shader = (type, source) => { if(!this.highPrecision)source=source.replace('precision highp float','precision mediump float'); const s = gl.createShader(type); gl.shaderSource(s, source); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
      const vs = shader(gl.VERTEX_SHADER, `
        attribute vec3 aPosition,aNormal,aColor;
        uniform mat4 uMatrix,uLightMatrix;
        varying vec3 vWorld,vNormal,vColor; varying vec4 vShadow; varying float vMaterial;
        void main(){gl_Position=uMatrix*vec4(aPosition,1.0);vWorld=aPosition;vNormal=aNormal;vMaterial=length(aNormal);vColor=aColor;vShadow=uLightMatrix*vec4(aPosition,1.0);}`);
      const fs = shader(gl.FRAGMENT_SHADER, `
        precision highp float;
        uniform vec3 uSun,uAmbient,uDirect,uFog,uCenter,uEye;
        uniform vec4 uFlash,uBananaLight; uniform float uFlashRadius;
        uniform vec4 uActorLight0,uActorLight1;
        uniform float uActorGlow;
        uniform float uWindowTime,uWindowRate,uSeed,uShadowEnabled,uShore,uArtificial;
        uniform sampler2D uShadowMap;
        varying vec3 vWorld,vNormal,vColor; varying vec4 vShadow; varying float vMaterial;
        float hash(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
        float visibility(vec3 n){
          vec3 p=vShadow.xyz*.5+.5;
          if(uShadowEnabled<.5||p.x<0.0||p.x>1.0||p.y<0.0||p.y>1.0||p.z>1.0||p.z<0.0)return 1.0;
          float bias=max(.0012,.0025*(1.0-max(0.0,dot(n,uSun))));
          float sum=0.0;
          for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
            vec2 d=texture2D(uShadowMap,p.xy+vec2(float(x),float(y))/1024.0).rg;
            sum+=step(p.z-bias,d.x+d.y/255.0);
          }
          return sum/9.0;
        }
        vec3 actorLight(vec4 source,vec3 tint,vec3 n){
          vec3 delta=source.xyz-vWorld;
          float distanceToSource=length(delta);
          float falloff=max(0.0,1.0-distanceToSource/86.0);
          float diffuse=max(0.0,dot(n,delta/max(distanceToSource,.01)));
          return tint*source.w*falloff*falloff*diffuse;
        }
        void main(){
          // Keep the material tag independent of interpolated smooth normals.
          float size=vMaterial;vec3 n=size>.1?normalize(vNormal):vec3(0.0);
          if(size>2.5&&size<4.5){
            float fog=smoothstep(850.0,2600.0,length(vWorld.xz-uCenter.xz));
            gl_FragColor=vec4(vColor,.48*uArtificial*(size-3.0)*(1.0-fog));return;
          }
          float sun=max(0.0,dot(n,uSun));
          vec3 light=uAmbient*(.83+.17*n.y)+uDirect*sun*visibility(n);
          float flash=max(0.0,1.0-distance(vWorld,uFlash.xyz)/uFlashRadius);
          light+=vec3(1.0,.57,.20)*flash*flash*uFlash.w;
          float bananaGlow=max(0.0,1.0-distance(vWorld,uBananaLight.xyz)/34.0);
          light+=vec3(1.0,.73,.25)*bananaGlow*bananaGlow*uBananaLight.w;
          if(size<6.5)light+=uArtificial*(actorLight(uActorLight0,vec3(1.0,.73,.48),n)+actorLight(uActorLight1,vec3(.69,1.0,.78),n));
          vec3 color=vColor*(size<.1?vec3(1.05):light);
          if(size>4.5&&size<6.5)color=mix(vColor*light,vColor*1.15,uArtificial);
          if(size>6.5&&size<7.5){
            // A small emissive contribution identifies the source without a glowing outline.
            color=vColor*(light+vec3(uActorGlow));
          }
          if(size>10.5&&size<11.5)color=vColor*(light+vec3(.18));
          if(size>9.5&&size<10.5)color=vColor*(.9+.28*sin(uWindowTime*2.2+vWorld.x*.13));
          if(size>1.5&&size<2.5){
            vec3 cell=vColor*179.0+n*137.0+uSeed;
            float id=hash(cell),period=28.0+hash(cell+17.0)*62.0;
            float t=(uWindowTime+id*period)/period,slot=floor(t);
            float old=step(hash(cell+(slot-1.0)*19.0),uWindowRate),next=step(hash(cell+slot*19.0),uWindowRate);
            float on=mix(old,next,smoothstep(0.0,1.5,fract(t)*period));
            color=mix(vec3(.23,.36,.43)*light, mix(vec3(1.0,.65,.28),vec3(1.0,.87,.57),id),on);
          }
          if(vWorld.y<-.5&&vWorld.z>uShore+44.0&&n.y>.9){
            float glint=pow(max(0.0,dot(reflect(-uSun,n),normalize(uEye-vWorld))),64.0);
            color+=uDirect*glint*.8;
          }
          // Haze belongs to the distant landscape, independent of camera zoom.
          float fog=smoothstep(850.0,2600.0,length(vWorld.xz-uCenter.xz))*.97;
          gl_FragColor=vec4(mix(color,uFog,fog),1.0);
        }`);
      this.program = gl.createProgram(); gl.attachShader(this.program, vs); gl.attachShader(this.program, fs); gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
      gl.deleteShader(vs); gl.deleteShader(fs); gl.useProgram(this.program);
      this.attributes = ['aPosition', 'aNormal', 'aColor'].map(n => gl.getAttribLocation(this.program, n));
      this.uMatrix = gl.getUniformLocation(this.program, 'uMatrix'); this.uEye = gl.getUniformLocation(this.program, 'uEye');
      this.lightingUniforms=Object.fromEntries(['uLightMatrix','uSun','uAmbient','uDirect','uFog','uCenter','uWindowTime','uWindowRate','uSeed','uShadowEnabled','uShadowMap','uShore','uArtificial','uFlash','uFlashRadius','uBananaLight','uActorLight0','uActorLight1','uActorGlow'].map(n=>[n,gl.getUniformLocation(this.program,n)]));
      this.initShadows(shader);
      this.staticBuffer = gl.createBuffer(); this.dynamicBuffer = gl.createBuffer(); this.ambientBuffer = gl.createBuffer();
      gl.enable(gl.DEPTH_TEST);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA); gl.clearColor(0,0,0,0);
      this.camera = new CameraRig(); this.clock = 0; this.cachedGame = null; this.revision = -1; this.lost = false;
      this.replayPanel = document.createElement('section');
      this.replayPanel.className = 'replay-panel'; this.replayPanel.hidden = true;
      this.replayPanel.setAttribute('aria-label','Einschlag-Replay in Zeitlupe');
      this.replayPanel.innerHTML = '<div class="replay-heading"><span>↶ EINSCHLAG · REPLAY</span><button type="button" aria-label="Replay schließen" title="Replay überspringen">×</button></div><div class="replay-progress"><span></span></div>';
      canvas.parentElement.append(this.replayPanel);
      this.replayPanel.querySelector('button').addEventListener('click',()=>this.closeReplay());
      canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; document.getElementById('view-status').textContent = '3D-Grafik unterbrochen. Bitte neu laden oder über Neues Match zu 2D wechseln.'; });
      this.bindCameraControls();
    }
    bindCameraControls() {
      const canvas=this.canvas;
      canvas.addEventListener('contextmenu', e => e.preventDefault());
      canvas.addEventListener('pointerdown', e => {
        if (![0,2].includes(e.button)) return;
        e.preventDefault();canvas.focus({preventScroll:true});
        this.drag = { x:e.clientX, y:e.clientY, id:e.pointerId, pan:e.button===2||e.shiftKey };
        canvas.setPointerCapture(e.pointerId);
      });
      canvas.addEventListener('pointermove', e => {
        if (!this.drag || this.drag.id !== e.pointerId) return;
        const dx=e.clientX-this.drag.x,dy=e.clientY-this.drag.y;
        if(this.drag.pan) {
          const scale=2*this.camera.pose.distance*Math.tan(Math.PI/8)*Math.max(1,1.45/(canvas.clientWidth/canvas.clientHeight))/Math.max(1,canvas.clientHeight);
          this.camera.pan(-dx*scale,dy*scale/Math.max(.3,Math.sin(this.camera.pose.pitch)));
        } else this.camera.orbit(-dx*.006,dy*.004);
        this.drag.x=e.clientX;this.drag.y=e.clientY;
      });
      const end = () => { this.drag = null; }; canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end); canvas.addEventListener('lostpointercapture', end);
      canvas.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) return; e.preventDefault(); this.zoom(e.deltaY > 0 ? 1.08 : 1/1.08); }, { passive: false });
      canvas.addEventListener('keydown', e => {
        if (e.key === 'a' || e.key === 'd') { this.camera.orbit(e.key === 'a' ? .1 : -.1,0); e.preventDefault(); }
        if (e.key === '+' || e.key === '-') { this.zoom(e.key === '+' ? .9 : 1.1); e.preventDefault(); }
        const panKeys={j:[-30,0],l:[30,0],i:[0,30],k:[0,-30]};
        if(panKeys[e.key.toLowerCase()]) { this.camera.pan(...panKeys[e.key.toLowerCase()]);e.preventDefault(); }
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
    streetSurface(m,game,{left,right,back,front}) {
      m.quad([left,1,back],[left,1,front],[right,1,front],[right,1,back],'#637472',[0,1,0]);
    }
    initShadows(shader) {
      const gl=this.gl;
      const vs=shader(gl.VERTEX_SHADER,'attribute vec3 aPosition; uniform mat4 uMatrix; void main(){gl_Position=uMatrix*vec4(aPosition,1.0);}');
      const fs=shader(gl.FRAGMENT_SHADER,'precision highp float; void main(){float d=gl_FragCoord.z*255.0;gl_FragColor=vec4(floor(d)/255.0,fract(d),0.0,1.0);}');
      this.shadowProgram=gl.createProgram();gl.attachShader(this.shadowProgram,vs);gl.attachShader(this.shadowProgram,fs);gl.linkProgram(this.shadowProgram);
      if(!gl.getProgramParameter(this.shadowProgram,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(this.shadowProgram));
      gl.deleteShader(vs);gl.deleteShader(fs);
      this.shadowPosition=gl.getAttribLocation(this.shadowProgram,'aPosition');this.shadowMatrixUniform=gl.getUniformLocation(this.shadowProgram,'uMatrix');
      this.shadowTexture=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1024,1024,0,gl.RGBA,gl.UNSIGNED_BYTE,null);
      for(const p of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,p,gl.NEAREST);
      for(const p of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,p,gl.CLAMP_TO_EDGE);
      this.shadowDepth=gl.createRenderbuffer();gl.bindRenderbuffer(gl.RENDERBUFFER,this.shadowDepth);gl.renderbufferStorage(gl.RENDERBUFFER,gl.DEPTH_COMPONENT16,1024,1024);
      this.shadowFramebuffer=gl.createFramebuffer();gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER,gl.COLOR_ATTACHMENT0,gl.TEXTURE_2D,this.shadowTexture,0);
      gl.framebufferRenderbuffer(gl.FRAMEBUFFER,gl.DEPTH_ATTACHMENT,gl.RENDERBUFFER,this.shadowDepth);
      this.shadowsAvailable=gl.checkFramebufferStatus(gl.FRAMEBUFFER)===gl.FRAMEBUFFER_COMPLETE&&this.highPrecision;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);
    }
    cacheShadows(game) {
      const gl=this.gl,b=cityBounds(game),center=[(b.left+b.right)/2,100,(b.back+b.front)/2];
      const z=this.light.direction,x=norm(cross([0,1,0],z)),y=cross(z,x),eye=center.map((v,i)=>v+z[i]*1600);
      const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,eye),-dot(y,eye),-dot(z,eye),1]);
      const span=900,near=1,far=3200;
      this.lightMatrix=multiply(new Float32Array([1/span,0,0,0,0,1/span,0,0,0,0,-2/(far-near),0,0,0,-(far+near)/(far-near),1]),view);
      if(!this.shadowsAvailable)return;
      gl.bindTexture(gl.TEXTURE_2D,null);gl.bindFramebuffer(gl.FRAMEBUFFER,this.shadowFramebuffer);gl.viewport(0,0,1024,1024);
      gl.clearColor(1,1,1,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.shadowProgram);
      gl.uniformMatrix4fv(this.shadowMatrixUniform,false,this.lightMatrix);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.staticBuffer);
      for(const loc of this.attributes)gl.disableVertexAttribArray(loc);
      gl.enableVertexAttribArray(this.shadowPosition);gl.vertexAttribPointer(this.shadowPosition,3,gl.FLOAT,false,36,0);
      gl.enable(gl.POLYGON_OFFSET_FILL);gl.polygonOffset(2,4);
      gl.drawArrays(gl.TRIANGLES,0,this.staticCount);gl.disable(gl.POLYGON_OFFSET_FILL);this.shadowUpdates=(this.shadowUpdates||0)+1;this.drawCalls++;
      gl.bindFramebuffer(gl.FRAMEBUFFER,null);gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clearColor(0,0,0,0);gl.useProgram(this.program);
    }
    applyLighting(game) {
      const gl=this.gl,u=this.lightingUniforms,b=cityBounds(game),l=this.light;
      this.setActorLights(game.gorillas, l);
      gl.uniformMatrix4fv(u.uLightMatrix,false,this.lightMatrix);
      for(const [name,value] of [['uSun',l.direction],['uAmbient',l.ambient],['uDirect',l.direct],['uFog',l.fog],['uCenter',[(b.left+b.right)/2,0,(b.back+b.front)/2]]])gl.uniform3fv(u[name],value);
      gl.uniform1f(u.uShore,b.shore);gl.uniform1f(u.uArtificial,l.artificial);
      // Keep the actor readable at night, but lower its own emission during the
      // bright dusk transition (around 18:00) where the surroundings are still lit.
      const dusk=Math.max(0,Math.min(1,(l.windowRate-.25)/.75));
      gl.uniform1f(u.uActorGlow,l.artificial*(.26+.24*(1-dusk)));
      gl.uniform1f(u.uWindowTime,this.windowTime||0);gl.uniform1f(u.uWindowRate,l.windowRate);gl.uniform1f(u.uSeed,l.seed);
      gl.uniform1f(u.uShadowEnabled,this.shadowsAvailable?1:0);gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,this.shadowTexture);gl.uniform1i(u.uShadowMap,0);
    }
    setActorLights(gorillas, light=this.light) {
      const dusk=Math.max(0,Math.min(1,((light?.windowRate??0)-.25)/.75));
      // Dusk already has substantial ambient and window light; keep the local
      // pool readable without washing out the roof beneath the actor.
      const strength=1.05+.45*(1-dusk);
      gorillas.forEach((g,i)=>this.gl.uniform4f(this.lightingUniforms[`uActorLight${i}`],g.x,g.y+18,g.z,g.alive?strength:0));
    }
    setExplosionLight(hit,reduced) {
      const flash=explosionLight(hit,reduced),u=this.lightingUniforms;
      this.gl.uniform4f(u.uFlash,hit?.x||0,hit?.y||0,hit?.z||0,flash.strength*(.55+.45*(this.light?.artificial||0)));
      this.gl.uniform1f(u.uFlashRadius,flash.radius);
    }
    setBananaLight(shot) {
      if(!this.lightingUniforms)return;
      this.gl.uniform4f(this.lightingUniforms.uBananaLight,shot?.x||0,shot?.y||0,shot?.z||0,shot ? (shot.charged ? .65 : .42) : 0);
    }
    countryside(m,{left,right,back,front}) {
      // Smooth low hills and farm clearings continue beyond the existing woodland ring.
      const hills=[[left-460,back+220,310,260,85],[right+460,back+180,330,270,100],
        [left-440,back-430,420,320,135],[right+480,back-420,440,350,155],
        [left-120,back-820,380,340,120],[right+30,back-920,420,380,165]];
      for(const [cx,cz,rx,rz,height] of hills) {
        const point=(u,v)=>{
          const q=Math.max(0,1-u*u-v*v);
          return [cx+u*rx,-.8+height*q*q,cz+v*rz];
        };
        const color=(u,v)=>{const q=Math.max(0,1-u*u-v*v);return rgb('#98aa8a').map((c,i)=>c+(rgb('#8fa384')[i]-c)*q);};
        const normal=(u,v)=>{const q=Math.max(0,1-u*u-v*v);return norm([4*height*q*u/rx,1,4*height*q*v/rz]);};
        for(let j=0;j<12;j++)for(let i=0;i<12;i++) {
          const u=i/6-1,v=j/6-1,U=(i+1)/6-1,V=(j+1)/6-1;
          m.quad(point(u,v),point(u,V),point(U,V),point(U,v),[color(u,v),color(u,V),color(U,V),color(U,v)],[normal(u,v),normal(u,V),normal(U,V),normal(U,v)]);
        }
        for(let i=0;i<18;i++) {
          const a=i*2.399,r=.35+(i%4)*.13,u=Math.cos(a)*r,v=Math.sin(a)*r,p=point(u,v),tree=new Mesh();
          this.pine(tree,0,0,.65+i%3*.18);m.appendRotated(tree,p,Math.PI/2);
        }
      }
      for(const side of [-1,1]) {
        const x=side<0?left-400:right+310,z=front-125;
        // Pasture strips, a farm lane and two modest outbuildings remain static.
        for(let i=0;i<4;i++)m.box(x+i*22,-.5,z,20,.4,95,i%2?'#aaa77b':'#a3ae83');
        m.line([x-15,.1,front-18],[x-15,.1,z-30],4,'#c0b495');
        for(let i=0;i<2;i++) {
          const X=x+i*44,Z=z-35;
          m.box(X,0,Z,29,15,23,'#b7a48a');
          m.quad([X-3,15,Z-3],[X+32,15,Z-3],[X+32,24,Z+11.5],[X-3,24,Z+11.5],'#8c8071');
          m.quad([X-3,24,Z+11.5],[X+32,24,Z+11.5],[X+32,15,Z+26],[X-3,15,Z+26],'#8c8071');
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
      m.box(left,-1,back,right-left,2,front-back,'#637472',[true,true,true,true,false,true]);
      this.streetSurface(m,game,bounds);
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
      this.countryside(m,bounds);
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
      for(const b of game.buildings) this.building(m,b);
      for(let x=left+18;x<right-20;x+=53) {
        this.tree(m,x,front+17,.6);
        m.box(x+12,4,front+7,10,2.5,3,'#8a7257');m.box(x+12,6.5,front+9,10,4,1,'#8a7257');
      }
      const lamp=(x,z,ground)=>{
        m.box(x,ground,z,1,23,1,'#546965');
        m.lamp(x-2,ground+23,z-1,5,1.5,3,'#ffe1a2');
        m.lightPool(x,ground+.04,z,19,26);
      };
      for(const x of columns){
        lamp(x-14,back+12,1);
        for(const z of rows.filter((_,i)=>i%2===1))lamp(x+80,z+30,1);
        lamp(x+15,front+22,4);
      }
      for(let i=0;i<7;i++) {
        const x=left+65+i*63,z=shore+17+(i%2)*13;
        m.box(x-5,.1,z-4,10,.2,17,i%2?'#d59373':'#8baeb0');
        m.box(x,0,z,1,13,1,'#a58b67');
        for(let j=0;j<8;j++) {
          const a=j*Math.PI/4,b=(j+1)*Math.PI/4;
          m.quad([x,16,z],[x+Math.cos(a)*10,12,z+Math.sin(a)*10],[x+Math.cos(b)*10,12,z+Math.sin(b)*10],[x,16,z],j%2?'#e6d5ae':'#bc8065');
        }
        m.box(x-3,.5,z+7,3,1.5,5,'#cead8b');m.box(x-3,2,z+8,3,1,3,'#698b91');
      }
      const pierX=right-100;
      m.box(pierX,-.5,shore-1,24,3,106,'#947d60');
      for(let z=shore+2;z<shore+104;z+=6)m.box(pierX,2.6,z,24,.3,.7,'#d6be94');
      m.box(pierX+41,-3,shore+70,16,6,34,'#ece0be');m.box(pierX+43,3,shore+76,12,7,18,'#d39a77');m.box(pierX+44,10,shore+78,10,1,14,'#efe6cd');
      this.staticCount = this.upload(this.staticBuffer,m,this.gl.STATIC_DRAW);
    }
    ambientModel(kind) {
      const m=new Mesh(),glass='#526f79',dark='#36494d';
      if(['car','taxi','bus'].includes(kind)) {
        const bus=kind==='bus',length=bus?23:12,color=bus?'#b1c8b1':kind==='taxi'?'#dfb75d':'#bd7863';
        m.box(-3,1,-length/2,6,bus?7:3,length,color);
        m.box(-2.7,bus?5:4,-length/2+3,5.4,3,length-6,glass);
        m.box(-3,bus?8:7,-length/2+2,6,1,length-4,color);
        for(const x of [-3.5,2.5])for(const z of [-length/2+2,length/2-4])m.box(x,0,z,1,2.5,2,dark);
        for(const x of [-2.5,1.5]){
          m.lamp(x,2,length/2+.05,1,1,.2,'#fff0bd');
          m.lamp(x,2,-length/2-.25,1,1,.2,'#ed6048');
        }
        m.lightPool(0,.12,length/2+13,7,16);
        if(kind==='taxi')m.lamp(-1,8,-1,2,1.2,2,'#f9e3b2');
      } else if(kind==='boat'||kind==='sailboat') {
        m.box(-5,0,-11,10,3,22,'#e8d9b8');m.box(-3,3,-6,6,4,9,'#8aada6');
        m.quad([-5,0,11],[5,0,11],[0,2,18],[0,2,18],'#e8d9b8');
        if(kind==='sailboat') {
          m.box(0,3,-1,1,33,1,'#a68b69');
          m.quad([1,35,0],[1,8,0],[1,8,17],[1,35,0],'#fff0cd');
          m.quad([0,30,0],[0,8,-12],[0,8,0],[0,30,0],'#d3a27c');
        } else {m.box(-3,7,-7,6,1,11,'#eedec0');m.box(-2.7,4,3.1,5.4,2,.2,glass);}
        m.lamp(-5,5,0,1,1,2,'#ed6048');m.lamp(4,5,0,1,1,2,'#b5e8bb');
        // Small wake stays attached to the hull; no particles or water simulation.
        for(const x of [-4,4])m.line([x,.2,-12],[x*2,.2,-30],1,'#c3d6c9');
      } else if(kind==='walker') {
        m.box(-1,1.5,-.8,2,3,1.6,'#ba8268');m.box(-.8,4.5,-.7,1.6,1.6,1.4,'#dbbc91');
        for(const x of [-.8,.3])m.box(x,0,-.6,.6,1.5,1.2,dark);
      } else {
        // Low-poly airship: one quiet silhouette, well behind the skyline.
        for(let j=0;j<6;j++)for(let i=0;i<10;i++) {
          const p=(a,b)=>[Math.sin(b*Math.PI/6)*Math.cos(a*Math.PI/5)*12,Math.sin(b*Math.PI/6)*Math.sin(a*Math.PI/5)*12,Math.cos(b*Math.PI/6)*36];
          m.quad(p(i,j),p(i+1,j),p(i+1,j+1),p(i,j+1),i<5?'#e0d4b6':'#abbeb1');
        }
        m.box(-3,-15,-8,6,5,15,'#967e63');m.box(-1,-5,-34,2,21,11,'#a98167');m.box(-15,-1,-32,30,2,9,'#a98167');
      }
      return new Float32Array(m.data);
    }
    drawAmbient(game,reduced) {
      const gl=this.gl;
      if(this.ambientGame!==game||this.ambientRound!==game.round) {
        this.ambientGame=game;this.ambientRound=game.round;this.life=new AmbientLife(game);
        this.ambientModels??=new Map();
        for(const actor of this.life.actors) {
          if(!this.ambientModels.has(actor.kind))this.ambientModels.set(actor.kind,this.ambientModel(actor.kind));
          actor.mesh=this.ambientModels.get(actor.kind);
        }
        this.ambientData=new Float32Array(this.life.actors.reduce((n,a)=>n+a.mesh.length,0));
        this.ambientTime=null;
        gl.bindBuffer(gl.ARRAY_BUFFER,this.ambientBuffer);gl.bufferData(gl.ARRAY_BUFFER,this.ambientData.byteLength,gl.DYNAMIC_DRAW);
      }
      const actors=this.life.update(this.clock,reduced);
      if(this.ambientTime!==this.life.time) {
        this.ambientTime=this.life.time;
        let offset=0;
        for(const actor of actors) {
          const a=actor.mesh,c=Math.cos(actor.heading),s=Math.sin(actor.heading),out=this.ambientData;
          for(let i=0;i<a.length;i+=9) {
            out[offset++]=actor.pose[0]+a[i]*c+a[i+2]*s;out[offset++]=actor.pose[1]+a[i+1];out[offset++]=actor.pose[2]-a[i]*s+a[i+2]*c;
            out[offset++]=a[i+3]*c+a[i+5]*s;out[offset++]=a[i+4];out[offset++]=-a[i+3]*s+a[i+5]*c;
            out[offset++]=a[i+6];out[offset++]=a[i+7];out[offset++]=a[i+8];
          }
        }
        gl.bindBuffer(gl.ARRAY_BUFFER,this.ambientBuffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.ambientData);
      }
      this.renderBuffer(this.ambientBuffer,this.ambientData.length/9);
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
        // Length-two normals mark windows; the shader varies occupancy without rebuilding the city.
        const window=[(x+.5)/b.nx,(y+.5)/b.ny,((b.seed+z*313)%100003)/100003];
        const yy=Y+2,top=Y+6;
        if(faces[0]&&z===b.nz-1)m.quad([X+2,yy,Z+C+.03],[X+5,yy,Z+C+.03],[X+5,top,Z+C+.03],[X+2,top,Z+C+.03],window,[0,0,2]);
        if(faces[1]&&z===0)m.quad([X+5,yy,Z-.03],[X+2,yy,Z-.03],[X+2,top,Z-.03],[X+5,top,Z-.03],window,[0,0,-2]);
        if(faces[2]&&x===b.nx-1)m.quad([X+C+.03,yy,Z+2],[X+C+.03,yy,Z+5],[X+C+.03,top,Z+5],[X+C+.03,top,Z+2],window,[2,0,0]);
        if(faces[3]&&x===0)m.quad([X-.03,yy,Z+5],[X-.03,yy,Z+2],[X-.03,top,Z+2],[X-.03,top,Z+5],window,[-2,0,0]);
        if(faces[4]&&y===b.ny-1)m.box(X,Y+C+.04,Z,C,.3,C,'#c3c4ad',[false,false,false,false,true,false]);
      }
      // Entry lights and a small wash remain attached to intact ground-floor cells.
      const entry=Math.floor(b.nx/2);
      if(occupied(b,entry,0,b.nz-1)) {
        const x=b.x+(entry+.5)*C,z=b.z+b.depth;
        m.lamp(x-1,5,z+.08,2,1.5,.6,'#ffd59b');
        m.lightPool(x,3.04,z+2,11,3);
        // Paired sconces frame the entrance without adding real-time point lights.
        for(const side of [-1,1])m.lamp(x+side*5,7,z+.08,1,3,.5,'#ffd59b');
      }
      this.neonSigns(m,b);
      this.roofDetails(m,b);
    }
    neonSigns(m,b) {
      const words=['BAR','CAFE','KINO','JAZZ','HOTEL','CLUB'];
      const glyphs={A:'010101111101101',B:'110101110101110',C:'011100100100011',E:'111100110100111',F:'111100110100100',H:'101101111101101',I:'111010010010111',J:'001001001101010',K:'101101110101101',L:'100100100100111',N:'101111111111101',O:'010101101101010',R:'110101110101101',T:'111010010010010',U:'101101101101111',Z:'111001010100111'};
      const colors=['#f28ba9','#71dce0','#f4cf78','#b69cf1','#a9e7a4','#ffad78'];
      const sign=(face,word,color,level)=>{
        const side=face==='side',start=Math.floor((side?b.nz:b.nx)/2),edge=side?b.nx-1:b.nz-1;
        const intact=[start-2,start-1,start,start+1,start+2].every(i=>i>=0&&i<(side?b.nz:b.nx)&&
          occupied(b,side?edge:i,level,side?i:edge)&&occupied(b,side?edge:i,level+1,side?i:edge));
        if(!intact)return;
        const width=word.length*5+5,y=level*CELL+2,u=(side?b.z+b.depth/2:b.x+b.width/2)-width/2;
        const x=b.x+b.width+.18,z=b.z+b.depth+.18;
        if(side)m.box(x,y-1,u-1,.7,13,width+2,'#263d47');
        else m.box(u-1,y-1,z,width+2,13,.7,'#263d47');
        for(let letter=0;letter<word.length;letter++){
          const bits=glyphs[word[letter]];
          for(let row=0;row<5;row++)for(let col=0;col<3;col++)if(bits[row*3+col]==='1'){
            const a=u+3+letter*5+col*1.35,b=y+9-row*1.7;
            if(side)m.quad([x+.74,b,a],[x+.74,b,a+1.1],[x+.74,b+1.25,a+1.1],[x+.74,b+1.25,a],color,[10,0,0]);
            else m.quad([a,b,z+.74],[a+1.1,b,z+.74],[a+1.1,b+1.25,z+.74],[a,b+1.25,z+.74],color,[0,0,10]);
          }
        }
        // A small corner motif breaks up the row of lettering without adding another light source.
        if(side)m.lamp(x+.75,y+4,u+width-1,.5,3,.5,color);
        else m.lamp(u+width-1,y+4,z+.75,.5,3,.5,color);
      };
      const primary=b.seed%words.length;
      if(b.seed%2===0&&b.ny>3)sign('front',words[primary],colors[primary],Math.min(1+b.seed%3,b.ny-3));
      if(b.seed%5===1&&b.ny>4)sign('side',words[(primary+2)%words.length],colors[(primary+3)%colors.length],Math.min(2+b.seed%3,b.ny-3));
    }
    roofDetails(m,b) {
      if(b.player!==undefined)return;
      const y=b.height,top=b.ny-1,C=CELL;
      const clear=(x,z,w=1,d=1)=>{
        for(let dz=0;dz<d;dz++)for(let dx=0;dx<w;dx++)if(!occupied(b,x+dx,top,z+dz))return false;
        return true;
      };
      if(b.seed%3!==0)for(let x=0;x<b.nx;x++)for(const z of [0,b.nz-1])if(clear(x,z))
        m.box(b.x+x*C,y+.1,b.z+z*C,C,2.2,1.2,'#b9b9a7');
      if(b.seed%3===2)for(let z=1;z<b.nz-1;z++)for(const x of [0,b.nx-1])if(clear(x,z))
        m.box(b.x+x*C,y+.1,b.z+z*C,1.2,2.2,C,'#b9b9a7');
      if(!clear(2,2,2,2))return;
      const x=b.x+2*C,z=b.z+2*C,variant=b.seed%5;
      // Wind markers move onto surviving cells after damage. Keep their bases and
      // poles clear even when the chosen cell falls inside this design footprint.
      if(this.windSites?.some(site=>site.y>1&&site.x>=x-2&&site.x<=x+19&&site.z>=z-2&&site.z<=z+18))return;
      if(variant===0){
        // Sawtooth glass skylight with a visible ridge.
        m.box(x,y+.5,z,16,1,16,'#7b8e8d');
        m.quad([x,y+2,z],[x+8,y+8,z],[x+8,y+8,z+16],[x,y+2,z+16],'#7fb1b6');
        m.quad([x+8,y+8,z],[x+16,y+2,z],[x+16,y+2,z+16],[x+8,y+8,z+16],'#a8cfca');
        m.line([x+8,y+8,z],[x+8,y+8,z+16],1.3,'#e2d5b3');
      } else if(variant===1){
        // Planted roof terrace with two raised beds and a light pergola.
        for(const dx of [0,9]){m.box(x+dx,y+1,z,7,3,15,'#9b7865');m.box(x+dx+.6,y+4,z+.6,5.8,1,13.8,'#799b6e');}
        for(const dx of [1,14])for(const dz of [1,14])m.box(x+dx,y+1,z+dz,1,12,1,'#8c8068');
        for(const dz of [1,8,14])m.box(x,y+13,z+dz,16,1,1,'#bba887');
      } else if(variant===2){
        // A pair of inclined solar panels reads as a dark blue roof band.
        for(const dz of [0,9]){
          m.box(x,y+1,z+dz,16,2,7,'#647b7b');
          m.quad([x,y+3,z+dz],[x+16,y+3,z+dz],[x+16,y+8,z+dz+7],[x,y+8,z+dz+7],'#456b86');
          for(const dx of [5,10])m.line([x+dx,y+3,z+dz],[x+dx,y+8,z+dz+7],.5,'#a3bcc1');
        }
      } else if(variant===3){
        // Elevated water tank and service ladder add a distinct skyline shape.
        for(const dx of [2,12])for(const dz of [2,12])m.box(x+dx,y+1,z+dz,1.5,12,1.5,'#708380');
        m.box(x+1,y+12,z+1,14,9,14,'#a2aaa0');m.box(x,y+20,z,16,2,16,'#d0c4a5');
        for(let h=3;h<18;h+=3)m.line([x+1,y+h,z-.5],[x+5,y+h,z-.5],.6,'#d8caaa');
      } else {
        // Ventilation housings and ducts form a low industrial roofscape.
        m.box(x,y+1,z,11,8,10,'#879a95');m.box(x+1,y+9,z+1,9,1,8,'#bdc3b0');
        for(const dz of [2,4,6,8])m.box(x+11.05,y+3,z+dz,1,3,.6,'#4c666c');
        m.box(x+11,y+1,z+11,5,5,5,'#697f7c');m.box(x+12,y+6,z+12,3,1,3,'#b9c2b1');
      }
    }
    sun(m,game,eye,time,reduced) {
      if(this.light.sun.y<=0)return;
      const centre=[this.light.sun.x,this.light.sun.y,this.light.sun.z],f=norm(eye.map((v,i)=>v-centre[i]));
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
      for(let i=1;i<(s.trail?.length||0);i++) { const a=s.trail[i-1],b=s.trail[i];m.line([a.x,a.y,a.z],[b.x,b.y,b.z],.4+i/s.trail.length*.65,s.charged?'#e7d985':'#bda36b'); }
      const rot=s.time*9;
      for(let i=0;i<5;i++) {const a=i*.5-1,xx=Math.cos(a)*5-3,yy=Math.sin(a)*5;const start=m.data.length;
        m.box(s.x+xx*Math.cos(rot)-yy*Math.sin(rot)-1,s.y+xx*Math.sin(rot)+yy*Math.cos(rot)-1,s.z-1,2.8,2.8,2.8,i===0?'#907144':'#ffe17a');
        for(let k=start;k<m.data.length;k+=9)for(let axis=3;axis<6;axis++)m.data[k+axis]*=11;
      }
    }
    explosion(m,hit,reduced) {
      const t=hit.age;
      if(t<0||t>=1.7)return;
      if(t<.5)m.sphere(hit.x,hit.y,hit.z,Math.max(.1,hit.radius*(.3+.7*Math.sin(Math.min(1,t/.5)*Math.PI/2))),t<.16?'#fff3c1':'#f19a4e',true);
      if(reduced)return;
      if(t<.55){
        const r=hit.radius*(.55+t*2.4),height=hit.y+2+t*10;
        for(let i=0;i<20;i++){const a=i*Math.PI/10,b=(i+1)*Math.PI/10;
          m.line([hit.x+Math.cos(a)*r,height,hit.z+Math.sin(a)*r],[hit.x+Math.cos(b)*r,height,hit.z+Math.sin(b)*r],Math.max(.3,2.3*(1-t/.55)),t<.24?'#ffe4a0':'#ef8d4b');}
      }
      for(let i=0;i<24;i++) {const a=i*2.399,r=hit.radius*(.45+t*(1.2+i%4*.18)),x=hit.x+Math.cos(a)*r,z=hit.z+Math.sin(a)*r;
        const y=hit.y+8+t*(23+i%5*7)-t*t*37,size=Math.max(.1,(1-t/1.7)*(i%3+1));
        if(i%4)m.lamp(x,y,z,size,size,size,i%3?'#ffbd62':'#fff0b0');else m.box(x,y,z,size,size,size,'#65706a');
      }
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
      this.setActorLights(replay.gorillas.map((g,i)=>({...g,alive:g.alive&&(impactAge<0||clip.hit.type!=='gorilla'||clip.hit.player!==i)})));
      this.setExplosionLight({...clip.hit,age:impactAge},reduced);
      this.setBananaLight(impactAge<0?{...frame.point,charged:clip.shot.charged}:null);
      this.ctx.clearRect(x-2,y-28,w+4,h+34);
      gl.enable(gl.SCISSOR_TEST);gl.scissor(left,bottom,width,height);gl.viewport(left,bottom,width,height);
      gl.clearColor(...this.light.fog,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.clearColor(0,0,0,0);
      gl.uniformMatrix4fv(this.uMatrix,false,matrix(clip.eye,clip.target,w/h));gl.uniform3fv(this.uEye,clip.eye);
      gl.uniform1f(this.lightingUniforms.uShadowEnabled,impactAge<0?0:(this.shadowsAvailable?1:0));
      this.renderBuffer(impactAge<0?replay.beforeBuffer:this.staticBuffer,impactAge<0?replay.beforeCount:this.staticCount);
      this.renderBuffer(this.dynamicBuffer,this.upload(this.dynamicBuffer,mesh,gl.DYNAMIC_DRAW));
      gl.disable(gl.SCISSOR_TEST);gl.viewport(0,0,this.canvas.width,this.canvas.height);
    }
    gorilla(destination,g,player,time,celebrate,reduced,throwAge=-1) {
      if(!g.alive)return;
      window.GorillaModel3D.append(destination,g,player,time,Number(celebrate),reduced,throwAge);
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
      const elapsed=paused?0:Math.max(0,Math.min(50,time-(this.lastTime??time)));
      this.clock+=elapsed;this.windowTime=(this.windowTime||0)+(reduced?0:elapsed/1000);this.lastTime=time;
      const pose=this.camera.update(game,this.clock,reduced),dist=pose.distance*Math.max(1,1.45/(width/height));
      const eye=[pose.target[0]+Math.sin(pose.yaw)*Math.cos(pose.pitch)*dist,pose.target[1]+Math.sin(pose.pitch)*dist,pose.target[2]+Math.cos(pose.yaw)*Math.cos(pose.pitch)*dist];
      this.mvp=matrix(eye,pose.target,width/height);
      const gl=this.gl;gl.viewport(0,0,this.canvas.width,this.canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(this.program);gl.uniformMatrix4fv(this.uMatrix,false,this.mvp);gl.uniform3fv(this.uEye,eye);
      this.observeReplay(game);
      const lightingChanged=this.cachedGame!==game||this.lightRound!==game.round||this.lightHour!==game.dayHour;
      if(lightingChanged) {
        this.light=daylight(game);this.lightRound=game.round;this.lightHour=game.dayHour;
      }
      const cityChanged=this.cachedGame!==game||this.revision!==game.revision;
      if(cityChanged)this.staticCity(game);
      if(cityChanged||lightingChanged)this.cacheShadows(game);
      this.cachedGame=game;this.revision=game.revision;
      this.applyLighting(game);
      this.setExplosionLight(game.impact,reduced);
      this.setBananaLight(game.phase==='flying'?game.shot:null);
      // Match the sky to the haze at the far ground plane, including when orbiting.
      const horizonDistance=(3500-eye[1]*Math.sin(pose.pitch))/Math.cos(pose.pitch);
      const horizon=this.project(eye[0]-Math.sin(pose.yaw)*horizonDistance,0,eye[2]-Math.cos(pose.yaw)*horizonDistance);
      const stop=Math.max(0,Math.min(100,horizon.y/height*100)).toFixed(1);
      const css=c=>`rgb(${c.map(v=>Math.round(v*255)).join(',')})`;
      const background=`linear-gradient(${css(this.light.sky)},${css(this.light.fog)} ${stop}%)`;
      if(background!==this.skyBackground){this.canvas.style.background=background;this.skyBackground=background;}
      this.renderBuffer(this.staticBuffer,this.staticCount);
      this.drawAmbient(game,reduced);
      const m=new Mesh();
      this.sun(m,game,eye,time,reduced);
      for(const site of this.windSites)this[site.type==='flag'?'flag':'windsock'](m,site,game.wind,game.windZ,time,reduced);
      game.setAim(aim.angle,aim.direction);
      if(this.actorGame!==game||this.actorRound!==game.round){
        this.actorGame=game;this.actorRound=game.round;this.cheerWeights=[0,0];
        this.actorShot=null;this.throwStarts=[-Infinity,-Infinity];
      }
      if(game.shot&&this.actorShot!==game.shot){
        this.actorShot=game.shot;
        // The flight simulation runs faster than real time; keep the gesture at human speed.
        this.throwStarts[game.turn]=this.clock-game.shot.time/3*1000;
      }
      game.gorillas.forEach((g,p)=>{
        const target=Number(game.winner===p&&game.phase!=='impact');
        this.cheerWeights[p]=reduced?target:this.cheerWeights[p]+(target-this.cheerWeights[p])*(1-Math.exp(-elapsed/180));
        this.gorilla(m,g,p,this.windowTime*1000,this.cheerWeights[p],reduced,
          Number.isFinite(this.throwStarts[p])?(this.clock-this.throwStarts[p])/1000:-1);
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
        if(!on){c.fillStyle='#263e46';c.fillRect(w/2-112,58,224,25);c.fillStyle='#ffdf91';c.font='bold 11px "Courier New"';c.textAlign='center';c.fillText(`BANANE ↗ ${Math.round(s.y)} m HÖHE`,w/2,75);}
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
