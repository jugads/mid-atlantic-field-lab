/* Countdown pauses independently of the match clock. */
(function(root){
  class Countdown {
    constructor(duration=3){this.duration=duration;this.cancel();}
    start(){if(this.active)return false;this.remaining=this.duration;this.active=true;this.running=true;return true;}
    togglePause(){if(!this.active)return false;this.running=!this.running;return true;}
    cancel(){this.remaining=0;this.active=false;this.running=false;}
    advance(dt){
      if(!this.active||!this.running)return false;
      this.remaining=Math.max(0,this.remaining-Math.max(0,dt));
      if(this.remaining>1e-9)return false;
      this.cancel();return true;
    }
  }
  root.MatchCountdown={Countdown};
  if(typeof module!=='undefined')module.exports=root.MatchCountdown;
})(globalThis);
