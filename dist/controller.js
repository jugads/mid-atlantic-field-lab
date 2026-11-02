/* Standard Gamepad API mapping. Keeps edge-triggered controls separate from holds. */
(function(root){
  const DEADZONE=.15;
  const axis=v=>{v=Number.isFinite(v)?Math.max(-1,Math.min(1,v)):0;const magnitude=Math.abs(v);return magnitude<=DEADZONE?0:Math.sign(v)*(magnitude-DEADZONE)/(1-DEADZONE);};
  const neutral=()=>({connected:false,supported:false,x:0,y:0,turn:0,shoot:false,intake:false,switchRobot:false,startPause:false,confirm:false,previousChoice:false,nextChoice:false});
  class ControllerInput{
    constructor(){this.lastIndex=null;this.previous={};}
    poll(pads,blocked=false){
      const all=Array.from(pads||[]).filter(p=>p&&p.connected!==false);
      // Some browsers expose capable controllers without identifying their mapping.
      const pad=all.find(p=>p.mapping==='standard')||all.find(p=>(p.axes?.length||0)>=4&&(p.buttons?.length||0)>=10);
      if(!pad){this.lastIndex=null;this.previous={};return {...neutral(),connected:all.length>0};}
      if(this.lastIndex!==pad.index){this.previous={};this.lastIndex=pad.index;}
      const pressed=index=>!!pad.buttons?.[index]&&(!!pad.buttons[index].pressed||pad.buttons[index].value>.5);
      const current={next:pressed(5),start:pressed(9),confirm:pressed(0),previousChoice:pressed(14),nextChoice:pressed(15)};
      const edge=key=>current[key]&&!this.previous[key];
      const state={connected:true,supported:true,generic:pad.mapping!=='standard',x:axis(pad.axes?.[0]),y:axis(pad.axes?.[1]),turn:axis(pad.axes?.[2]),
        shoot:pressed(0)||pressed(7),intake:pressed(6),switchRobot:edge('next'),startPause:edge('start'),confirm:edge('confirm'),previousChoice:edge('previousChoice'),nextChoice:edge('nextChoice')};
      this.previous=current;
      return blocked?{...neutral(),connected:true,supported:true,generic:state.generic}:state;
    }
  }
  root.ControllerInput={ControllerInput,axis,DEADZONE};
  if(typeof module!=='undefined')module.exports=root.ControllerInput;
})(globalThis);
