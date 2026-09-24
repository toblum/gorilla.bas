/* Cached, smooth-shaded gorilla rig. Presentation only; no gameplay state or RNG. */
(function(root) {
  'use strict';
  const colors = [['#fa8650','#98553d','#fbc391'],['#bce0bd','#637e68','#e2e4b9']];
  const rgb = hex => [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const clamp = x => Math.max(0,Math.min(1,x));
  const smooth = x => { x=clamp(x); return x*x*(3-2*x); };
  // Analytic ellipsoid normals keep the silhouette soft without a dense mesh.
  function ellipsoid(out, center, radius, color) {
    const large=Math.max(...radius)>=3, slices=large?12:8, stacks=large?8:6;
    const point=(u,v)=>{
      const n=[Math.sin(v)*Math.cos(u),Math.cos(v),Math.sin(v)*Math.sin(u)];
      const normal=n.map((x,i)=>x/radius[i]),length=Math.hypot(...normal);
      return [...n.map((x,i)=>center[i]+radius[i]*x),...normal.map(x=>x/length),...rgb(color)];
    };
    for(let j=0;j<stacks;j++)for(let i=0;i<slices;i++){
      const a=point(i*2*Math.PI/slices,j*Math.PI/stacks),b=point((i+1)*2*Math.PI/slices,j*Math.PI/stacks);
      const c=point((i+1)*2*Math.PI/slices,(j+1)*Math.PI/stacks),d=point(i*2*Math.PI/slices,(j+1)*Math.PI/stacks);
      if(j>0)out.push(...a,...b,...d);
      if(j<stacks-1)out.push(...b,...c,...d);
    }
  }
  function torsoPatch(out,color,back=false) {
    // One skin surface follows the barrel torso; shallow shading suggests pectorals,
    // rather than attaching separate spherical pads to the chest.
    const base=rgb(color),rows=10,columns=12,direction=back?-1:1;
    const front=(x,y)=>(back?Math.min:Math.max)(
      -1.2+direction*5.6*Math.sqrt(Math.max(0,1-x*x/81-(y-17)**2/42.25)),
      -1+direction*4.8*Math.sqrt(Math.max(0,1-x*x/50.41-(y-11.8)**2/44.89)));
    const point=(u,v)=>{
      const width=3.1+3.8*Math.sin(v*Math.PI*.72),x=u*width;
      const y=9.1+v*11.3+v**5*Math.abs(u)*.65;
      const z=front(x,y)+direction*.16;
      const n=[-direction*(front(x+.02,y)-front(x-.02,y))/.04,-direction*(front(x,y+.02)-front(x,y-.02))/.04,direction];
      const length=Math.hypot(...n);
      const sternum=Math.exp(-x*x*5)*Math.exp(-((y-18)**2)/12)*.22;
      const crease=Math.exp(-((y-15.8+Math.abs(x)*.12)**2)*9)*.10;
      const shade=1-sternum-crease;
      return [x,y,z,...n.map(a=>a/length),...base.map(a=>a*shade)];
    };
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
      const a=point(i/columns*2-1,j/rows),b=point((i+1)/columns*2-1,j/rows);
      const c=point((i+1)/columns*2-1,(j+1)/rows),d=point(i/columns*2-1,(j+1)/rows);
      out.push(...a,...b,...c,...a,...c,...d);
    }
  }
  function build(player) {
    const [fur,dark,skin]=colors[player],parts=Array.from({length:10},()=>[]);
    const add=(bone,p,r,c=fur)=>ellipsoid(parts[bone],p,r,c);
    const tuft=(bone,p,r)=>{
      const points=[];ellipsoid(points,p,r,fur);
      for(let i=0;i<points.length;i+=9){
        const taper=.25+.75*(points[i+1]-p[1]+r[1])/(2*r[1]);
        points[i]=p[0]+(points[i]-p[0])*taper;
        const nx=points[i+3]/taper,ny=points[i+4]-nx*(points[i]-p[0])*.375/r[1];
        const length=Math.hypot(nx,ny,points[i+5]);
        points[i+3]=nx/length;points[i+4]=ny/length;points[i+5]/=length;
      }
      parts[bone].push(...points);
    };
    const chest=player===0?'#c58a62':'#8da88b',saddle=player===0?'#d49368':'#92ae99';
    // Broad pectorals and a tapered belly recall the original sprite's anatomy.
    for(const side of [-1,1]){
      add(side<0?7:8,[side*.2,-4.2,1.7],[3.3,1.8,4.7],dark);
      add(side<0?7:8,[0,-.5,0],[3.6,4.9,3.8]);
    }
    add(1,[0,11.8,-1],[7.1,6.7,4.8]);
    add(1,[0,17,-1.2],[9,6.5,5.6]);
    torsoPatch(parts[1],chest);
    torsoPatch(parts[1],saddle,true);
    for(const side of [-1,1]){
      // Shoulder blades, a silverback saddle and short layered tufts break up the back.
      for(let row=0;row<3;row++)tuft(1,[side*(5.8-row*.45),16-row*2.1,-5.2],[.9,2.3,.5]);
      for(let row=0;row<3;row++)tuft(2,[side*(2.5-row*.45),-.5-row*1.3,-4.6],[.85,1.7,.42]);
    }
    add(2,[0,0,-.9],[5.8,5.6,4.8]);
    add(2,[0,-.6,3],[4.55,3.35,2],dark);
    add(2,[0,-2,4],[3.7,2.15,1.55],skin);
    add(2,[0,-.9,5],[2.1,1.05,.8],dark);
    for(const side of [-1,1]){
      add(2,[side*5.3,-.1,0],[1.05,1.65,1.1],dark);
      add(9,[side*2.15,0,0],[1.15,.8,.65],'#283c41');
      add(9,[side*2.1,.1,.58],[.28,.3,.18],'#fff1cf');
      add(2,[side*2,2,3.9],[2.15,.7,1.05]);
      add(2,[side*.75,-.8,5.65],[.38,.25,.17],'#283c41');
    }
    add(2,[0,-2.8,5.12],[1.7,.23,.22],dark);
    for(let arm=0;arm<2;arm++){
      const upper=3+arm*2,fore=upper+1;
      add(upper,[0,-1,0],[3.9,4.25,4]);
      add(upper,[0,-4,0],[3.05,4.4,3.1]);
      add(fore,[0,-3.25,.35],[3.2,4.1,3.3]);
      add(fore,[0,-6.15,1],[3.05,2.25,3.15],dark);
      for(let f=0;f<3;f++)add(fore,[(f-1)*1.55,-6.7,3.1],[.85,1.25,.85],dark);
    }
    return parts.map(a=>new Float32Array(a));
  }
  const models=colors.map((_,i)=>build(i));
  // Deterministic gestures do not consume the game's random sequence.
  function pulse(t,start,duration,period) {
    const phase=((t%period)+period)%period;
    return phase>start&&phase<start+duration?Math.sin((phase-start)/duration*Math.PI)**2:0;
  }
  function pose(time=0, celebration=0, throwAge=-1, reduced=false) {
    const t=reduced?0:time/1000,c=clamp(celebration),motion=reduced?0:1;
    const release=!reduced&&throwAge>=0 ? 1-smooth(throwAge/.72) : 0;
    const idle=(1-c)*(1-release)*motion;
    const breath=Math.sin(t*2.1)*.55*motion;
    const look=pulse(t,5.5,2.3,11)*idle,scratch=pulse(t,8,2.4,15)*idle;
    const hop=Math.max(0,Math.sin(t*5))**2*2.8*c*motion;
    const sway=(Math.sin(t*2)*.035*idle+Math.sin(t*3.6)*.055*c)*motion;
    const bones=[[-1,[0,hop,0],0,0],
      [0,[Math.sin(t*2)*.45*idle,breath,0],.018*Math.sin(t*1.4)*idle,sway],
      [1,[0,24,-.1],-.035+breath*.06+look*.12,look*.12]];
    for(let arm=0;arm<2;arm++){
      const side=arm===0?-1:1;
      const cheer=c*(1.95+.3*Math.sin(t*4.5+side*.7)*motion);
      const follow=arm===1?release:0,gesture=arm===0?scratch:0;
      bones.push([1,[side*8,19,-.5],-.08-follow*2.65-gesture*1.1+.055*Math.sin(t*2+side)*idle,side*(.12+cheer+gesture*.2)]);
      bones.push([3+arm*2,[0,-6.1,0],-.14-c*.5-follow*.35-gesture*1.7,0]);
    }
    for(const side of [-1,1]){
      const step=Math.max(0,Math.sin(t*5+side*Math.PI/2))*c*motion;
      const pitch=step*.32;
      bones.push([0,[side*4.6,6+step*1.2+Math.sin(pitch)*4.7,-.6],pitch,0]);
    }
    const blink=(pulse(t,2.4,.24,4.7)+pulse(t,2.77,.18,9.4))*motion;
    bones.push([2,[0,1.1,4.1],0,0,1-blink*.96]);
    return bones;
  }
  function transforms(bones) {
    return bones.reduce((result,[parent,p,rx,rz,sy=1])=>{
      const cx=Math.cos(rx),sx=Math.sin(rx),cz=Math.cos(rz),sz=Math.sin(rz);
      const local=[cz,-sz*cx,sz*sx,sz,cz*cx,-cz*sx,0,sx,cx];
      const previous=result[parent];
      if(!previous){result.push({r:local,p,sy});return result;}
      const r=Array(9).fill(0),a=previous.r;
      for(let i=0;i<3;i++)for(let j=0;j<3;j++)for(let k=0;k<3;k++)r[i*3+j]+=a[i*3+k]*local[k*3+j];
      result.push({r,sy,p:p.map((_,i)=>previous.p[i]+a[i*3]*p[0]+a[i*3+1]*p[1]+a[i*3+2]*p[2])});return result;
    },[]);
  }
  function append(destination,g,player,time,celebration=0,reduced=false,throwAge=-1) {
    if(!g.alive)return;
    const bones=transforms(pose(time+player*1370,celebration,throwAge,reduced));
    const co=Math.sin(g.heading??player*Math.PI),si=Math.cos(g.heading??player*Math.PI);
    for(let bone=0;bone<bones.length;bone++){
      const data=models[player][bone],{r,p,sy}=bones[bone];
      for(let i=0;i<data.length;i+=9){
        const x=p[0]+r[0]*data[i]+r[1]*data[i+1]*sy+r[2]*data[i+2];
        const y=p[1]+r[3]*data[i]+r[4]*data[i+1]*sy+r[5]*data[i+2];
        const z=p[2]+r[6]*data[i]+r[7]*data[i+1]*sy+r[8]*data[i+2];
        const normalScale=sy===1?1:1/Math.hypot(data[i+3],data[i+4]/sy,data[i+5]);
        const nx=r[0]*data[i+3]+r[1]*data[i+4]/sy+r[2]*data[i+5];
        const ny=r[3]*data[i+3]+r[4]*data[i+4]/sy+r[5]*data[i+5];
        const nz=r[6]*data[i+3]+r[7]*data[i+4]/sy+r[8]*data[i+5];
        destination.data.push(g.x+x*co+z*si,g.y+y,g.z-x*si+z*co,
          (nx*co+nz*si)*7*normalScale,ny*7*normalScale,(-nx*si+nz*co)*7*normalScale,data[i+6],data[i+7],data[i+8]);
      }
    }
  }
  class Portrait {
    constructor(canvas) {
      this.canvas=canvas;
      const gl=this.gl=canvas.getContext('webgl',{alpha:true,antialias:true,powerPreference:'low-power'});
      if(!gl)throw new Error('WebGL portrait unavailable');
      const shader=(type,source)=>{
        const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);
        if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      const vertex=shader(gl.VERTEX_SHADER,`
        attribute vec3 aPosition,aNormal,aColor;
        varying vec3 vNormal,vColor;
        void main(){
          gl_Position=vec4((aPosition.x+aPosition.z*.18)*.049,(aPosition.y-14.0)*.044,-aPosition.z*.018,1.0);
          vNormal=aNormal;vColor=aColor;
        }`);
      const fragment=shader(gl.FRAGMENT_SHADER,`
        precision mediump float;
        varying vec3 vNormal,vColor;
        void main(){
          vec3 light=normalize(vec3(.35,.7,1.0));
          float diffuse=max(0.0,dot(normalize(vNormal),light));
          gl_FragColor=vec4(vColor*(.57+.53*diffuse),1.0);
        }`);
      const program=gl.createProgram();gl.attachShader(program,vertex);gl.attachShader(program,fragment);
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program));
      gl.deleteShader(vertex);gl.deleteShader(fragment);gl.useProgram(program);
      this.attributes=['aPosition','aNormal','aColor'].map(name=>gl.getAttribLocation(program,name));
      this.buffer=gl.createBuffer();gl.enable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
      this.lost=false;
      canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();this.lost=true;});
    }
    draw(player,time,reduced=false) {
      if(this.lost)return false;
      const gl=this.gl,canvas=this.canvas;
      const ratio=Math.min(root.devicePixelRatio||1,2),width=Math.round(canvas.clientWidth*ratio),height=Math.round(canvas.clientHeight*ratio);
      if(!width||!height)return false;
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      const mesh={data:[]};
      append(mesh,{x:0,y:0,z:0,heading:Math.PI/2,alive:true},player,time,1,reduced);
      gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(mesh.data),gl.DYNAMIC_DRAW);
      this.attributes.forEach((location,index)=>{gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,36,index*12);});
      gl.drawArrays(gl.TRIANGLES,0,mesh.data.length/9);
      return true;
    }
  }
  const api={append,pose,Portrait};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.GorillaModel3D=api;
})(typeof window!=='undefined'?window:globalThis);
