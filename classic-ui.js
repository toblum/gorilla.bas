/* Classic's own UI and PC-speaker score. No enhanced-mode effects. */
(function(root){
  'use strict';
  const {ClassicGame,Screen,sprites,palette}=root.GorillasClassic;
  const $=id=>document.getElementById(id);
  const {Score,Speaker,melodies}=root.ClassicSound;
  class ClassicUI {
    constructor(sound,onEnd){
      this.sound=sound;this.onEnd=onEnd;this.game=null;this.stage='title';this.lastPhase='';this.age=0;this.score=new Score();this.speaker=new Speaker(sound);
      this.canvas=$('classic-game');this.ctx=this.canvas.getContext('2d');this.input=$('classic-input');
      $('classic-form').addEventListener('submit',e=>{e.preventDefault();if(!this.active())return;if(this.stage!=='play'||this.game.phase==='gameOver')this.advance();else if(this.game.phase==='aiming'){this.game.enter(this.input.value);this.sync(true);}});
      this.input.addEventListener('input',()=>{if(this.game?.phase==='aiming'&&this.stage==='play'){this.game.input=this.input.value.replace(/[^0-9.]/g,'').replace(/(\..*)\./g,'$1');this.input.value=this.game.input;this.game.prompt();}});
      this.canvas.addEventListener('pointerdown',()=>{if(this.stage==='play'&&this.game.phase==='aiming')this.input.focus({preventScroll:true});else this.canvas.focus({preventScroll:true});});
      document.addEventListener('keydown',e=>{
        if(!this.active()||$('settings').open||e.altKey||e.ctrlKey||e.metaKey||e.repeat||e.target.closest('button,a'))return;
        if(this.stage!=='play'||this.game.phase==='gameOver'){e.preventDefault();this.advance(e.key);}
      });
    }
    pause(){this.speaker.reset();if(this.stage==='intro')this.resumeIntro=true;}
    active(){return document.body.classList.contains('mode-classic')&&this.game;}
    start(options){this.game=new ClassicGame(options);this.stage='title';this.age=0;this.lastPhase='';this.score=new Score();this.speaker.reset();this.resumeIntro=false;this.play(melodies.title);this.sync();this.canvas.focus({preventScroll:true});}
    advance(key='p'){
      if(this.stage==='title'){this.stage='choice';this.age=0;}
      else if(this.stage==='choice'){this.stage=key.toLowerCase()==='v'?'intro':'play';this.age=0;this.introStep=-1;this.sound.stop();this.speaker.reset();if(this.stage==='intro'){this.intro=this.score.intro();this.speaker.play(this.intro);this.resumeIntro=false;}}
      else if(this.stage==='intro'){this.stage='play';this.sound.stop();this.speaker.reset();}
      else if(this.game.phase==='gameOver'){this.onEnd();return;}
      this.sync(true);
    }
    sync(focus=false){
      const aiming=this.stage==='play'&&this.game.phase==='aiming',over=this.stage==='play'&&this.game.phase==='gameOver';
      this.input.hidden=!aiming;this.input.disabled=!aiming;
      if(aiming){this.input.value=this.game.input;$('classic-label').textContent=this.game.inputStage==='angle'?'Angle (Winkel)':'Velocity (Stärke)';}
      else $('classic-label').textContent=over?'GAME OVER!':this.stage==='choice'?'V: Intro ansehen · P: Spielen':this.stage==='title'?'QBasic Gorillas · 1990':this.stage==='intro'?'QBasic-Intro':'Banane unterwegs …';
      $('classic-submit').hidden=this.stage==='play'&&!aiming&&!over;
      $('classic-submit').textContent=aiming?'Enter ↵':over?'Zum Startbildschirm':'Weiter ↵';
      $('classic-intro').hidden=this.stage!=='choice';
      $('classic-status').textContent=aiming?`${this.game.options.names[this.game.turn]} · ${this.game.inputStage==='angle'?'Winkel':'Stärke'} eingeben und Enter drücken.`:over?`Endstand ${this.game.scores.join(' : ')} nach ${this.game.options.target} Runden.`:'Classic · QBasic EGA';
      if(focus&&!$('settings').open){if(aiming)this.input.focus({preventScroll:true});else this.canvas.focus({preventScroll:true});}
    }
    play(mml){this.speaker.play(this.score.compile(mml));}
    update(dt){
      if(!this.game)return;this.age+=dt;
      if(this.stage==='intro'){
        if(this.resumeIntro&&this.sound.enabled){this.speaker.play(this.intro,this.age);this.resumeIntro=false;}
        this.introStep=-1;for(const pose of this.intro.poses)if(pose.time<=this.age)this.introStep=pose.step;
        if(this.age>=this.intro.duration){this.stage='play';this.speaker.reset();this.sync(true);}
      }
      if(this.stage==='play'){
        this.game.update(dt);
        for(const event of this.game.events.splice(0))this.play(melodies[event]);
        const state=this.game.phase+this.game.turn+this.game.inputStage;
        if(state!==this.lastPhase){this.lastPhase=state;this.sync(true);}
      }
    }
    draw(){
      if(!this.game)return;let s=this.game.screen,textMode=this.stage==='title'||this.stage==='choice'||this.game.phase==='gameOver';
      if(this.stage!=='play'||this.game.phase==='gameOver'){
        s=new Screen();const center=(row,t,c=7)=>s.center(row,t,c);
        if(this.stage==='title'){
          center(4,'Q B a s i c    G O R I L L A S',15);center(6,'Copyright (C) Microsoft Corporation 1990');
          ['Your mission is to hit your opponent with the exploding','banana by varying the angle and power of your throw, taking','into account wind speed, gravity, and the city skyline.','The wind speed is shown by a directional arrow at the bottom','of the playing field, its length relative to its strength.'].forEach((t,i)=>center(8+i,t));center(24,'Press any key to continue');
        }else if(this.stage==='choice'){
          s.text(8,15,`Name of Player 1: ${this.game.options.names[0]}`,7);s.text(10,15,`Name of Player 2: ${this.game.options.names[1]}`,7);s.text(12,13,`Play to how many total points: ${this.game.options.target}`,7);s.text(14,17,`Gravity in Meters/Sec: ${this.game.options.gravity}`,7);
          s.text(16,34,'--------------',7);s.text(18,34,'V = View Intro',7);s.text(19,34,'P = Play Game',7);s.text(21,35,'Your Choice?',7);
        }else if(this.stage==='intro'){
          center(2,'Q B A S I C   G O R I L L A S',9);center(5,'             STARRING:               ',9);center(7,`${this.game.options.names[0]} AND ${this.game.options.names[1]}`,9);
          const frame=this.age<1?2:1-Math.max(0,this.introStep)%2;s.put(265,175,sprites[frame]);s.put(325,175,sprites[frame===2?2:1-frame]);
        }else{
          center(8,'GAME OVER!');center(10,'Score:');for(let p=0;p<2;p++){s.text(11+p,30,this.game.options.names[p],7);s.text(11+p,50,` ${this.game.scores[p]} `,7);}center(24,'Press any key to continue');
        }
        if(this.stage==='title'||this.game.phase==='gameOver'){
          const a=Math.floor(this.age*12)%5;
          for(let x=1;x<=80;x++) {if((x+a)%5===0)s.text(1,x,'*',4);if((x-a+5)%5===0)s.text(22,x,'*',4);}
          for(let y=2;y<=21;y++)if((y+a)%5===1){s.text(y,80,'*',4);s.text(23-y,1,'*',4);}
        }
      }
      const pixels=s.rgba();
      if(textMode){const colors={0:[0,0,0],7:[170,170,170],15:[255,255,255],4:[170,0,0]};for(let i=0;i<s.pixels.length;i++)pixels.set(colors[s.pixels[i]]||palette[s.pixels[i]],i*4);}
      this.ctx.putImageData(new ImageData(pixels,640,350),0,0);
    }
  }
  root.ClassicUI=ClassicUI;
})(window);
