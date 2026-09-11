/* Browser port of Microsoft GORILLA.BAS (1990), EGA SCREEN 9.
 * Keep this independent of the enhanced engines. See reference/README.md.
 * Coordinates, POINT collision order, PUT PSET/XOR, and even the unreachable
 * CASE 4 in MakeCityScape intentionally follow the original source. */
(function (root) {
  'use strict';
  const W = 640, H = 350, PI = Math.PI, ASPECT = 35 / 48;
  const font = typeof module !== 'undefined' && module.exports ? require('./classic-font.js') : root.ClassicFont;
  // EGA register values after SetScreen (not VGA's default 16-color palette).
  const registers = [1, 46, 44, 54, 4, 7, 4, 3, 56, 63, 58, 59, 60, 61, 62, 63];
  const palette = registers.map(n => [((n >> 2 & 1) * 170 + (n >> 5 & 1) * 85), ((n >> 1 & 1) * 170 + (n >> 4 & 1) * 85), ((n & 1) * 170 + (n >> 3 & 1) * 85)]);
  // QBasic CINT uses nearest-even rounding, including for implicit DEFINT assignments.
  function cint(n) { const f = Math.floor(n), r = n - f; return r === .5 ? f + (f & 1) : Math.round(n); }
  class Screen {
    constructor(width = W, height = H) { this.width = width; this.height = height; this.pixels = new Uint8Array(width * height); }
    point(x, y) { x = cint(x); y = cint(y); return x < 0 || y < 0 || x >= this.width || y >= this.height ? -1 : this.pixels[y * this.width + x]; }
    pset(x, y, color) { x = cint(x); y = cint(y); if (x >= 0 && y >= 0 && x < this.width && y < this.height) this.pixels[y * this.width + x] = color; }
    line(x, y, x2, y2, color) {
      x = cint(x); y = cint(y); x2 = cint(x2); y2 = cint(y2);
      // QBasic SCREEN 9 line bias, verified against the original sun rays.
      if (x2 < x) [x,y,x2,y2] = [x2,y2,x,y];
      let dx=Math.abs(x2-x),dy=Math.abs(y2-y),steep=dy>dx;
      if(steep) { [x,y,x2,y2]=[y,x,y2,x2]; [dx,dy]=[dy,dx]; }
      const sx=x2>x?1:-1,sy=y2>y?1:-1;let error=dx/4;
      for(;;x+=sx){this.pset(steep?y:x,steep?x:y,color);if(x===x2)break;error-=dy;if(error<0){y+=sy;error+=dx;}}

    }
    box(x, y, x2, y2, color, filled = true) {
      x = cint(x); y = cint(y); x2 = cint(x2); y2 = cint(y2);
      if (!filled) { this.line(x,y,x2,y,color); this.line(x2,y,x2,y2,color); this.line(x2,y2,x,y2,color); this.line(x,y2,x,y,color); return; }
      const lo = Math.max(0, Math.min(x,x2)), hi = Math.min(this.width - 1, Math.max(x,x2));
      if (hi < lo) return;
      for (let j = Math.max(0, Math.min(y,y2)); j <= Math.min(this.height - 1, Math.max(y,y2)); j++) this.pixels.fill(color, j * this.width + lo, j * this.width + hi + 1);
    }
    circle(cx, cy, radius, color, start = 0, end = 2 * PI, aspect = ASPECT) {
      cx = cint(cx); cy = cint(cy); radius = cint(radius); aspect = Math.abs(aspect);
      const rx = aspect > 1 ? cint(radius / aspect) : radius, ry = aspect > 1 ? radius : cint(radius * aspect);
      const full = start === 0 && end === 2 * PI;
      // Clip arcs at rounded endpoint coordinates, as integer BASIC does;
      // clipping by atan2 of the raster pixel incorrectly drops arm/leg tips.
      const endpoint = a => { const q=Math.min(3,Math.floor(a/(PI/2))),x=Math.abs(cint(rx*Math.cos(a))),y=Math.abs(cint(ry*Math.sin(a)));return [q,q%2 ? -y*(rx+1)+x : y*(rx+1)-x]; };
      const [sq,sk]=endpoint(start),[eq,ek]=endpoint(end);
      const plot = (x, y) => {
        const q=y<=0?(x>=0?0:1):(x<0?2:3),ax=Math.abs(x),ay=Math.abs(y),k=q%2?-ay*(rx+1)+ax:ay*(rx+1)-ax;
        const after=q>sq||(q===sq&&k>=sk),before=q<eq||(q===eq&&k<=ek);
        if(full||(start<=end?after&&before:after||before))this.pset(cx+x,cy+y,color);
      };
      if (!rx || !ry) { this.line(cx-rx,cy-ry,cx+rx,cy+ry,color); return; }
      let x=radius,y=0,error=1-radius;
      while(x>=y){
        for(const [a,b] of [[x,y],[y,x],[-x,y],[-y,x],[x,-y],[y,-x],[-x,-y],[-y,-x]])plot(cint(a*(aspect>1?1/aspect:1)),cint(b*(aspect>1?1:aspect)));
        y++;if(error<0)error+=2*y+1;else{x--;error+=2*(y-x)+1;}
      }

    }
    paint(x, y, color, border = color) {
      x = cint(x); y = cint(y); const stack = [[x,y]], seen = new Uint8Array(this.pixels.length);
      while (stack.length) { const [a,b] = stack.pop(); if (a < 0 || b < 0 || a >= this.width || b >= this.height) continue; const i = b*this.width+a; if (seen[i] || this.pixels[i] === border) continue; seen[i] = 1; this.pixels[i] = color; stack.push([a+1,b],[a-1,b],[a,b+1],[a,b-1]); }
    }
    get(x, y, width, height) { const s = new Screen(width,height); for (let b=0;b<height;b++) for(let a=0;a<width;a++) s.pset(a,b,this.point(x+a,y+b)); return s; }
    put(x,y,s,xor = false) { x=cint(x);y=cint(y); for(let b=0;b<s.height;b++) for(let a=0;a<s.width;a++) this.pset(x+a,y+b, xor ? this.point(x+a,y+b)^s.point(a,b) : s.point(a,b)); }
    text(row, col, text, color = 9, background = 0) {
      for (const char of String(text)) { let c = char.charCodeAt(0); if(c > 255) c=63;
        for(let y=0;y<14;y++) for(let x=0;x<8;x++) this.pset((col-1)*8+x,(row-1)*14+y, font[c*14+y] & (128>>x) ? color : background); col++;
      }
    }
    center(row,text,color = 9) { this.text(row,cint(40-(text.length/2+.5)),text,color); }
    rgba() { const out = new Uint8ClampedArray(this.pixels.length*4); for(let i=0;i<this.pixels.length;i++) { out.set(palette[this.pixels[i]],i*4); out[i*4+3]=255; } return out; }
  }
  function drawGorilla(s,x,y,arms) {
    const sc = cint;
    s.box(x-4,y,x+3,y+6,1); s.box(x-5,y+2,x+4,y+4,1); s.line(x-3,y+2,x+2,y+2,0);
    for(let i=-2;i<=-1;i++) { s.pset(x+i,y+4,0); s.pset(x+i+3,y+4,0); }
    s.line(x-3,y+7,x+2,y+7,1); s.box(x-8,y+8,x+7,y+14,1); s.box(x-6,y+15,x+5,y+20,1);
    for(let i=0;i<=4;i++) { s.circle(x+i,y+25,10,1,3*PI/4,9*PI/8); s.circle(x-6+sc(i-.1),y+25,10,1,15*PI/8,PI/4); }
    s.circle(x-5,y+10,5,0,3*PI/2,0); s.circle(x+5,y+10,5,0,PI,3*PI/2);
    for(let i=-5;i<=-1;i++) {
      s.circle(x+sc(i-.1),y+(arms===2?4:14),9,1,3*PI/4,5*PI/4);
      s.circle(x+5+i,y+(arms===1?4:14),9,1,7*PI/4,PI/4);
    }
  }
  const sprites = [1,2,3].map(arms => { const s=new Screen(60,60); drawGorilla(s,25,15,arms); return s.get(10,14,30,30); });
  // Exact EGA GET arrays from the EGABanana DATA statements, decoded as
  // scanline-major four bitplanes, with each plane padded to a byte boundary.
  const bananaData = [
    [458758,202116096,471604224,943208448,943208448,943208448,471604224,202116096,0],
    [262153,4063232,4063294,8323072,8323199,-2130771968,-2130738945,-2134835200,-2134802239],
    [262153,-2134835200,-2134802239,-2130771968,-2130738945,8323072,8323199,4063232,4063294],
    [458758,-1061109760,-522133504,1886416896,1886416896,1886416896,-522133504,-1061109760,0]
  ];
  const bananas = bananaData.map(data => { const width=data[0]&65535,height=data[0]>>>16,s=new Screen(width,height), bytes=[]; for(const n of data.slice(1)) for(let b=0;b<4;b++) bytes.push(n>>>(b*8)&255); const stride=Math.ceil(width/8); for(let y=0;y<height;y++) for(let x=0;x<width;x++) { let c=0;for(let p=0;p<4;p++) if(bytes[y*stride*4+p*stride+(x>>3)]&(128>>(x&7))) c|=1<<p; s.pset(x,y,c); } return s; });
  function drawSun(s,shock=false) {
    const x=320,y=25;
    s.box(x-22,y-18,x+22,y+18,0); s.circle(x,y,12,3); s.paint(x,y,3);
    for(const [dx,dy] of [[20,0],[0,15],[15,10],[15,-10],[8,13],[8,-13],[18,5],[18,-5]]) s.line(x-dx,y-dy,x+dx,y+dy,3);
    if(shock) { s.circle(x,y+5,3,0);s.paint(x,y+5,0,0); } else s.circle(x,y,8,0,210*PI/180,330*PI/180);
    for(const dx of [-3,3]) { s.circle(x+dx,y-2,1,0);s.pset(x+dx,y-2,0); }
  }
  class ClassicGame {
    constructor(options={},random=Math.random) { this.random=random;this.reset(options); }
    reset(options={}) {
      this.options={names:(options.names||['Player 1','Player 2']).map((n,i)=>(String(n).trim()||`Player ${i+1}`).slice(0,10)),target:Math.max(1,Math.min(99,Math.trunc(options.target)||3)),gravity:Number(options.gravity)>0?Number(options.gravity):9.8};
      this.scores=[0,0];this.turn=0;this.round=0;this.screen=new Screen();this.events=[];this.beginRound();
    }
    ran(n) { return Math.floor(this.random()*n)+1; }
    beginRound() {
      this.round++;this.screen.pixels.fill(0);this.buildings=[];this.shot=null;this.impact=null;this.winner=null;this.sunHit=false;this.age=0;this.accumulator=0;
      const s=this.screen,slope=this.ran(6);let newHt=slope===2||slope===6?130:15,x=2;
      do {
        if(slope===1)newHt+=10;else if(slope===2)newHt-=10;else if(slope>=3&&slope<=5)newHt+=x>320?-20:20;
        // CASE 4 is already consumed by CASE 3 TO 5. CASE 6 stays level.
        let width=this.ran(37)+37;if(x+width>640)width=640-x-2;
        let height=Math.max(10,this.ran(120)+newHt);if(335-height<=25)height=20;
        const color=this.ran(3)+4,b={x,y:335-height,width,height,color,windows:[]};this.buildings.push(b);
        s.box(x-1,336,x+width+1,b.y-1,0,false);s.box(x,335,x+width,b.y,color);
        for(let c=x+3;c<x+width-3;c+=10) for(let i=height-3;i>=7;i-=15) { const wc=this.ran(4)===1?8:14;s.box(c,335-i,c+3,335-i+6,wc);b.windows.push({x:c,y:335-i,color:wc}); }
        x+=width+2;
      }while(x<=630);
      this.wind=this.ran(10)-5;if(this.ran(3)===1)this.wind+=this.wind>0?this.ran(10):-this.ran(10);
      if(this.wind) { const end=320+this.wind*6,dir=this.wind>0?-2:2;s.line(320,345,end,345,2);s.line(end,345,end+dir,343,2);s.line(end,345,end+dir,347,2); }
      this.gorillas=[0,1].map(p=>{ const n=p===0?this.ran(2):this.buildings.length-1-this.ran(2),b=this.buildings[n],bw=this.buildings[n+1].x-b.x;return{x:cint(b.x+bw/2-14),y:b.y-30}; });
      this.gorillas.forEach(g=>s.put(g.x,g.y,sprites[2]));drawSun(s);this.phase='aiming';this.inputStage='angle';this.input='';this.angle='';this.prompt();
    }
    prompt() {
      const s=this.screen,col=this.turn===0?1:66;s.text(1,1,this.options.names[0]);s.text(1,79-this.options.names[1].length,this.options.names[1]);s.center(23,`${this.scores[0]}>Score<${this.scores[1]}`);
      s.text(2,col,'Angle:');s.text(2,col+7,(this.inputStage==='angle'?this.input+'_':this.angle+' ')+'    ');
      if(this.inputStage==='velocity') { s.text(3,col,'Velocity:');s.text(3,col+10,this.input+'_    '); }
    }
    enter(value) {
      if(this.phase!=='aiming')return false;
      if(!/^\d*\.?\d*$/.test(value)||Number(value)>360) { this.input='';this.prompt();return false; }
      if(this.inputStage==='angle') {this.angle=value;this.inputStage='velocity';this.input='';this.prompt();return true;}
      return this.fire(Number(this.angle),Number(value));
    }
    fire(angle,velocity) {
      if(this.phase!=='aiming'||!Number.isFinite(angle)||!Number.isFinite(velocity)||angle<0||angle>360||velocity<0||velocity>360)return false;
      const s=this.screen,g=this.gorillas[this.turn],a=(this.turn===1?180-angle:angle)*PI/180;
      for(let row=1;row<=4;row++){s.text(row,1,' '.repeat(30));s.text(row,50,' '.repeat(30));}
      this.sunHit=false;this.shot={sx:g.x+(this.turn===1?25:0),sy:g.y-7,vx:Math.cos(a)*cint(velocity),vy:Math.sin(a)*cint(velocity),t:0,point:velocity<2?1:0,inSun:false,erase:false};
      s.put(g.x,g.y,sprites[this.turn===0?1:0]);this.phase='throwing';this.age=0;this.accumulator=0;this.events.push('throw');return true;
    }
    stepShot() {
      const q=this.shot,s=this.screen;if(q.erase){s.put(q.x,q.y,bananas[q.rot],true);q.erase=false;}
      const x=q.sx+q.vx*q.t+.5*(this.wind/5)*q.t*q.t,y=q.sy-q.vy*q.t+.5*this.options.gravity*q.t*q.t;
      const onScreen=x<630&&x>3&&y<347;let impact=false;
      if(onScreen&&y>0){
        let lookX=this.turn===0?8:0,lookY=0;const direction=this.turn===0?-4:4;
        do {
          q.point=s.point(x+lookX,y+lookY);
          if(q.point===0){impact=false;if(q.inSun&&(Math.abs(320-x)>20||y>39))q.inSun=false;}
          else if(q.point===3&&y<39){if(!this.sunHit)drawSun(s,true);this.sunHit=true;q.inSun=true;}
          else impact=true;
          lookX+=direction;lookY+=6;
        }while(!impact&&lookX===4);
        if(!q.inSun&&!impact){q.rot=cint(q.t*10)%4;s.put(x,y,bananas[q.rot]);q.erase=true;}
        q.x=x;q.y=y;
      }
      q.x=x;q.y=y;
      q.t+=.1;
      if(impact||!onScreen){
        if(q.point===1){const hit=x<320?0:1;this.winner=1-hit;this.impact={x,y,hit};this.phase='gorillaExplosion';this.events.push('gorilla');}
        else if(impact){this.impact={x:x+4,y:y+4};this.phase='buildingExplosion';this.events.push('building');}
        else this.nextTurn();
        this.age=0;this.effectStep=0;
      }
    }
    nextTurn() {
      if(this.sunHit)drawSun(this.screen);this.sunHit=false;this.turn=1-this.turn;this.phase='aiming';this.shot=null;this.inputStage='angle';this.input='';this.angle='';this.prompt();
    }
    update(dt) {
      if(!Number.isFinite(dt)||dt<0)return;
      this.accumulator+=dt;
      // Rest .02, t += .1: keep the original sampled trajectory, independent of RAF.
      while(this.accumulator>=.02-1e-10){this.accumulator-=.02;this.tick(.02);}
    }
    tick(dt) {
      this.age+=dt;const s=this.screen;
      if(this.phase==='throwing'&&this.age>=.1){const g=this.gorillas[this.turn];s.put(g.x,g.y,sprites[2]);this.phase='flying';this.age=0;}
      else if(this.phase==='flying')this.stepShot();
      else if(this.phase==='buildingExplosion'){
        if(this.effectStep===0)for(let r=0;r<=7;r+=.5)s.circle(this.impact.x,this.impact.y,r,2);
        for(let j=0;j<4&&this.effectStep<=14;j++,this.effectStep++)s.circle(this.impact.x,this.impact.y,7-this.effectStep*.5,0);
        if(this.effectStep>14)this.nextTurn();
      }else if(this.phase==='gorillaExplosion'){
        const g=this.gorillas[this.impact.hit],cx=g.x+12,cy=g.y+12;
        // ExplodeGorilla, EGA SclX=2 / SclY=1.75; tall ellipses (-1.57).
        for(let k=0;k<4;k++){
          const step=++this.effectStep;
          if(step<=16){s.circle(cx,g.y+24.25,step,2,0,2*PI,1.57);s.line(g.x+14,g.y+15.75-step,g.x,g.y+15.75-step,2);}
          else if(step<=48){const i=step-16;if(i<16)s.circle(cx,g.y+24.25,17-i,0,0,2*PI,1.57);s.circle(cx,cy,i,i%2+1,0,2*PI,1.57);}
          else if(step<=96)s.circle(cx,cy,97-step,0,0,2*PI,1.57);
        }
        if(this.effectStep>=96){this.phase='celebrating';this.age=0;this.effectStep=-1;}
      }else if(this.phase==='celebrating'){
        const step=Math.floor((this.age+1e-8)/.528125); // seven L32 notes at T160 + Rest .2
        if(step>=8){this.scores[this.winner]++;this.turn=1-this.turn;this.phase='roundPause';this.age=0;if(this.sunHit)drawSun(s);}
        else if(step!==this.effectStep){this.effectStep=step;const g=this.gorillas[this.winner];s.put(g.x,g.y,sprites[step%2===0?1:0]);this.events.push('dance');}
      }else if(this.phase==='roundPause'&&this.age>=1){if(this.round>=this.options.target){this.phase='gameOver';this.age=0;}else this.beginRound();}
    }
  }
  const api={ClassicGame,Screen,W,H,palette,cint,drawSun,drawGorilla,sprites,bananas};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GorillasClassic=api;
})(globalThis);
