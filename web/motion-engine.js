/**
 * RED Loop Motion Engine — independent, canvas-based motion studies.
 * No third-party assets, dependencies or licensed component source.
 * Effects are paused at rest; animation starts only by explicit interaction.
 */
export const scenes = Object.freeze([
  {id:'spectral-fold',name:'Spectral Fold',category:'Partikel',description:'Ein dreidimensional gefaltetes Feld aus Lichtpunkten. Neigung und Falten reagieren direkt auf deine Eingabe.',tags:['3D','Dots','Material']},
  {id:'chromatic-current',name:'Chromatic Current',category:'Lichtfelder',description:'Fein gezeichnete Lichtbahnen, die in mehreren Tiefenebenen fließen und sich im Fokus auffächern.',tags:['Flow','Lines','Light']},
  {id:'orbit-wake',name:'Orbit Wake',category:'Partikel',description:'Elliptische Partikelbahnen mit räumlicher Tiefe und ruhigem Richtungswechsel.',tags:['Orbit','Particles','Depth']},
  {id:'satin-ridges',name:'Satin Ridges',category:'Material',description:'Lichtreflexe streifen über eine virtuelle, gefaltete Oberfläche.',tags:['Fabric','Light','Waves']},
  {id:'signal-matrix',name:'Signal Matrix',category:'Partikel',description:'Eine präzise Punktmatrix biegt sich sanft zur Zeigerposition und kehrt in ihre Ruheposition zurück.',tags:['Grid','Pointer','Responsive']},
  {id:'red-resonance',name:'Red Resonance',category:'Lichtfelder',description:'Ein fokussierter RED-Akzent erzeugt kontrollierte, konzentrische Wellen mit weichem Auslauf.',tags:['Pulse','Rings','Signal']},
  {id:'glass-filament',name:'Glass Filament',category:'Material',description:'Transparente Lichtfilamente spannen ein optisches Gewebe mit sanfter Tiefenreaktion.',tags:['Filament','Glass','Waves']},
  {id:'iris-caustics',name:'Iris Caustics',category:'Lichtfelder',description:'Gebrochene Lichtkonturen formen eine präzise Iris und verschieben sich mit dem Zeiger.',tags:['Caustics','Refraction','Iris']},
  {id:'prism-veil',name:'Prism Veil',category:'Material',description:'Geschichtete Glasflächen falten sich zu einem dezenten, räumlichen Prisma mit irisierenden Reflexionskanten.',tags:['Glass','Refraction','Panels']},
  {id:'vector-bloom',name:'Vector Bloom',category:'Lichtfelder',description:'Ein präzises Feld fein gekrümmter Lichtvektoren öffnet sich um einen interaktiven Fokuspunkt.',tags:['Vectors','Focus','Radial']},
]);

const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
const TAU=Math.PI*2;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{onStateChange?:(running:boolean)=>void}} options
 */
export function createMotionEngine(canvas,{onStateChange=()=>{}}={}) {
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx) throw new Error('Canvas 2D is unavailable');
  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  let config={scene:'spectral-fold',density:58,depth:58,speed:42,hue:340};
  let width=0,height=0,frame=0,redrawFrame=0,clock=0,last=0,running=false,destroyed=false,queued=false;
  let pointer={x:0,y:0,inside:false};
  let targetPointer={x:0,y:0,inside:false};

  function paintBackground(){
    ctx.fillStyle='#0a0e18';ctx.fillRect(0,0,width,height);
    const bloom=ctx.createRadialGradient(width*.56,height*.43,0,width*.56,height*.43,Math.max(width,height)*.72);
    bloom.addColorStop(0,'rgba(36,39,72,.49)');bloom.addColorStop(.56,'rgba(16,23,42,.25)');bloom.addColorStop(1,'rgba(6,9,19,.13)');
    ctx.fillStyle=bloom;ctx.fillRect(0,0,width,height);
  }
  function dot(x,y,r,color,alpha=1){
    if(x<0||y<0||x>width||y>height)return;
    ctx.globalAlpha=clamp(alpha,0,1);ctx.fillStyle=color;
    ctx.beginPath();ctx.arc(x,y,Math.max(.25,r),0,TAU);ctx.fill();
  }
  function color(offset=0,light=72,opacity=1){
    return `hsla(${(config.hue+offset+720)%360},85%,${light}%,${opacity})`;
  }
  function fold(t){
    const columns=Math.round(28+config.density*.65),rows=Math.round(columns*.68);
    const influence=config.depth/100;
    const mx=pointer.inside?pointer.x*.8:0;
    const my=pointer.inside?pointer.y*.5:0;
    for(let j=0;j<rows;j++){
      const v=(j/(rows-1)-.5)*2;
      for(let i=0;i<columns;i++){
        const u=(i/(columns-1)-.5)*2;
        const phase=u*3.3+v*.7+t*.52;
        const z=Math.sin(phase)*Math.cos(v*1.95-t*.23)*influence;
        const sweep=Math.sin(v*2.2+u*2.4+t*.3)*influence;
        const perspective=1+z*.16;
        const x=width*(.5+((u+mx*.17+z*.24)*.4)*perspective);
        const y=height*(.5+(v*.34+sweep*.11+my*.12)*perspective);
        const falloff=(1-Math.abs(v)*.65)*(1-Math.abs(u)*.22);
        const light=54+Math.max(0,z)*31+falloff*14;
        dot(x,y,.55+falloff*.75+z*.27,color(u*48+v*36,light),falloff*.87+.1);
      }
    }
  }
  function current(t){
    const count=Math.round(18+config.density*.28),points=Math.round(68+config.density*.55);
    ctx.lineWidth=.75;ctx.lineCap='round';
    for(let n=0;n<count;n++){
      ctx.beginPath();
      const v=(n/(count-1)-.5)*2;
      for(let i=0;i<points;i++){
        const u=i/(points-1);
        const envelope=Math.sin(u*Math.PI);
        const wave=Math.sin(u*9.2+t*.55+v*2.9)*height*.092*config.depth/100;
        const x=width*(.06+u*.88);
        const y=height*(.5+v*.24)+wave*envelope+Math.cos(u*4+t*.33+v)*height*.045;
        const offset=pointer.inside?pointer.y*height*.055*envelope:0;
        if(i===0)ctx.moveTo(x,y+offset);else ctx.lineTo(x,y+offset);
      }
      ctx.strokeStyle=color(n*2.8-35,64+n/count*13,.28+Math.sin(n/count*Math.PI)*.45);
      ctx.stroke();
    }
  }
  function orbit(t){
    const rings=6,count=Math.round(35+config.density*.9);
    const depth=config.depth/100;
    for(let r=0;r<rings;r++){
      const rx=width*(.10+r*.055),ry=height*(.065+r*.036);
      const tilt=.22+r*.17+(pointer.inside?pointer.y*.12:0);
      for(let i=0;i<count;i++){
        const a=i/count*TAU+t*(.08+r*.017)*(r%2?-1:1)+r*.6;
        const x=width*.5+Math.cos(a)*rx+Math.sin(a*2+r)*width*.007*depth;
        const y=height*.51+Math.sin(a)*ry*Math.cos(tilt)+Math.cos(a)*height*.19*Math.sin(tilt);
        const behind=Math.sin(a)*.5+.5;
        dot(x,y,.5+behind*.85,color(r*13-12,63+behind*19),.25+behind*.65);
      }
    }
  }
  function satin(t){
    const bands=Math.round(52+config.density*.5),segments=90;
    ctx.lineWidth=.72;
    for(let j=0;j<bands;j++){
      const v=j/(bands-1);
      const base=height*(.18+v*.64);
      ctx.beginPath();
      for(let i=0;i<=segments;i++){
        const u=i/segments;
        const crest=Math.sin(u*12+t*.42+v*2.4)*Math.cos(u*3.2-v*4+t*.2);
        const warp=crest*height*.12*config.depth/100;
        const y=base+warp*(.65+Math.sin(v*Math.PI)*.35);
        const x=width*(.05+u*.9);
        if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.strokeStyle=color(-46+v*65,51+v*30,.21+Math.sin(v*Math.PI)*.38);
      ctx.stroke();
    }
  }
  function matrix(t){
    const columns=Math.round(17+config.density*.42),rows=Math.round(columns*.62);
    const cx=width*.5,cy=height*.5;
    const focusX=pointer.inside?pointer.x*width*.29+cx:cx;
    const focusY=pointer.inside?pointer.y*height*.29+cy:cy;
    for(let j=0;j<rows;j++)for(let i=0;i<columns;i++){
      const x0=width*(.10+i/(columns-1)*.8),y0=height*(.16+j/(rows-1)*.68);
      const dist=Math.hypot((x0-focusX)/width,(y0-focusY)/height);
      const amplitude=Math.exp(-dist*dist*45)*config.depth/100;
      const phase=(i+j)*.21+t*.68;
      const x=x0+Math.cos(phase)*width*.035*amplitude;
      const y=y0-Math.sin(phase)*height*.08*amplitude;
      dot(x,y,.66+amplitude*1.75,color(i*.8+j*.7-22,53+amplitude*30),.32+amplitude*.68);
    }
  }
  function resonance(t){
    const cx=width*(.5+(pointer.inside?pointer.x*.11:0)),cy=height*(.48+(pointer.inside?pointer.y*.11:0));
    const spread=Math.min(width,height)*(.33+config.depth/100*.21);
    for(let ring=0;ring<14;ring++){
      const radius=(ring+.55)*spread/14;
      const shift=Math.sin(ring*.59+t*.58)*spread*.025;
      ctx.beginPath();ctx.ellipse(cx,cy,radius+shift,(radius+shift)*.64,.22,0,TAU);
      ctx.lineWidth=ring%3===0?1.25:.65;
      ctx.strokeStyle=color(ring*3-22,69+ring*.6,.68-ring*.036);
      ctx.stroke();
    }
    const core=ctx.createRadialGradient(cx,cy,0,cx,cy,spread*.26);
    core.addColorStop(0,color(-9,76,.24));core.addColorStop(1,color(-9,67,0));
    ctx.fillStyle=core;ctx.beginPath();ctx.arc(cx,cy,spread*.26,0,TAU);ctx.fill();
  }
  // Distinct, self-authored optical studies. Each remains legible when paused.
  function filament(t){
    const strands=Math.round(19+config.density*.31),segments=100;
    const depth=config.depth/100;
    const tilt=pointer.inside?pointer.y*.09:0;
    ctx.lineCap='round';
    for(let j=0;j<strands;j++){
      const v=j/(strands-1),layer=Math.sin(v*Math.PI);
      ctx.beginPath();
      for(let i=0;i<=segments;i++){
        const u=i/segments,envelope=Math.sin(u*Math.PI);
        const twist=Math.sin(u*10.7+t*.52+v*5.3)*Math.cos(u*3.1-v*2.7+t*.17);
        const x=width*(.065+.87*u+(v-.5)*envelope*.07);
        const y=height*(.23+v*.54+(twist*depth*.115+tilt)*envelope);
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=.48+layer*.75;
      ctx.strokeStyle=color(-38+v*83,61+layer*26,.15+layer*.60);
      ctx.stroke();
    }
    const x=width*(.51+(pointer.inside?pointer.x*.075:0)),y=height*.5;
    const glow=ctx.createRadialGradient(x,y,0,x,y,Math.min(width,height)*.48);
    glow.addColorStop(0,color(-12,84,.11));glow.addColorStop(1,color(0,75,0));
    ctx.fillStyle=glow;ctx.fillRect(0,0,width,height);
  }
  function caustics(t){
    const rings=Math.round(20+config.density*.27),segments=108,depth=config.depth/100;
    const cx=width*(.5+(pointer.inside?pointer.x*.075:0));
    const cy=height*(.5+(pointer.inside?pointer.y*.065:0));
    const radius=Math.min(width*.45,height*.49);
    ctx.lineCap='round';
    for(let r=0;r<rings;r++){
      const v=(r+.7)/rings;
      ctx.beginPath();
      for(let i=0;i<=segments;i++){
        const a=i/segments*TAU;
        const interference=Math.sin(a*7.0+r*.26+t*.43)*.045+Math.sin(a*3-r*.21-t*.26)*.03;
        const rr=radius*v*(1+interference*depth);
        const x=cx+Math.cos(a)*rr*1.3;
        const y=cy+Math.sin(a)*rr*.79;
        if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);
      }
      ctx.lineWidth=(r%6===0?1.05:.55);
      ctx.strokeStyle=color(-30+r*2.7,60+v*20,(1-v)*.72+.12);
      ctx.stroke();
    }
    const center=ctx.createRadialGradient(cx,cy,0,cx,cy,radius*.3);
    center.addColorStop(0,color(-18,78,.21));center.addColorStop(1,color(0,74,0));
    ctx.fillStyle=center;ctx.fillRect(cx-radius,cy-radius,radius*2,radius*2);
  }

  // Static at rest; dynamic geometry is evaluated only on user interaction or explicit playback.
  function prismVeil(t){
    const strips=Math.round(13+config.density*.18);
    const depth=config.depth/100;
    const tilt=pointer.inside?pointer.x*.22:0;
    ctx.lineJoin='round';
    for(let j=0;j<strips;j++){
      const v=j/strips;
      const offset=Math.sin(v*5.7+t*.18)*depth*.17;
      const left=width*(.12+v*.24+tilt*.10);
      const right=width*(.83-v*.14+tilt*.07);
      const top=height*(.09+v*.34+offset);
      const bottom=height*(.85-v*.13-offset);
      ctx.beginPath();
      ctx.moveTo(left,top);
      ctx.lineTo(right,top+height*(.13+Math.cos(v*4.1+t*.25)*depth*.06));
      ctx.lineTo(right-width*.06,bottom);
      ctx.lineTo(left-width*.04,bottom-height*.18);
      ctx.closePath();
      ctx.fillStyle=color(-48+j*8,57+v*21,.019+depth*.019);
      ctx.fill();
      ctx.lineWidth=.6+v*.8;
      ctx.strokeStyle=color(-34+j*6,63+v*23,.17+(1-v)*.34);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(left,top);
      ctx.lineTo(right,top+height*(.13+Math.cos(v*4.1+t*.25)*depth*.06));
      ctx.lineWidth=.55;
      ctx.strokeStyle=color(22+j*6,84,.20+depth*.20);
      ctx.stroke();
    }
  }
  function vectorBloom(t){
    const rays=Math.round(54+config.density*1.2),depth=config.depth/100;
    const cx=width*(.5+(pointer.inside?pointer.x*.12:0));
    const cy=height*(.5+(pointer.inside?pointer.y*.12:0));
    const span=Math.min(width,height)*.43;
    ctx.lineCap='round';
    for(let i=0;i<rays;i++){
      const angle=TAU*i/rays;
      const wave=Math.sin(angle*6+t*.32)*depth*.11;
      const bend=Math.sin(angle*3.2-t*.21)*depth*.075;
      const inner=span*(.07+(.5+.5*Math.sin(i*2.37))*depth*.12);
      const outer=span*(.59+(.5+.5*Math.sin(i*.73+t*.14))*.28);
      const ax=cx+Math.cos(angle)*inner;
      const ay=cy+Math.sin(angle)*inner*.82;
      const bx=cx+Math.cos(angle+wave)*outer;
      const by=cy+Math.sin(angle+wave)*outer*.82;
      const mx=cx+Math.cos(angle+bend)*outer*.53;
      const my=cy+Math.sin(angle+bend)*outer*.49;
      ctx.beginPath();ctx.moveTo(ax,ay);ctx.quadraticCurveTo(mx,my,bx,by);
      const intensity=(Math.sin(angle*2.6+t*.15)+1)*.5;
      ctx.lineWidth=.55+intensity*.62;
      ctx.strokeStyle=color(i*.82-30,58+intensity*26,.13+intensity*.56);
      ctx.stroke();
    }
    const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,span*.43);
    glow.addColorStop(0,color(-14,78,.21));glow.addColorStop(1,color(0,68,0));
    ctx.fillStyle=glow;
    ctx.beginPath();ctx.arc(cx,cy,span*.43,0,TAU);ctx.fill();
  }
  function draw(){
    if(destroyed||!width||!height)return;
    paintBackground();
    ctx.save();
    const t=clock;
    switch(config.scene){
      case 'chromatic-current':current(t);break;
      case 'orbit-wake':orbit(t);break;
      case 'satin-ridges':satin(t);break;
      case 'signal-matrix':matrix(t);break;
      case 'red-resonance':resonance(t);break;
      case 'glass-filament':filament(t);break;
      case 'iris-caustics':caustics(t);break;
      case 'prism-veil':prismVeil(t);break;
      case 'vector-bloom':vectorBloom(t);break;
      default:fold(t);
    }
    ctx.restore();ctx.globalAlpha=1;
  }
  function renderOnce(){if(queued||running||destroyed)return;queued=true;redrawFrame=requestAnimationFrame(()=>{queued=false;redrawFrame=0;draw();});}
  function tick(now){
    if(!running||destroyed)return;
    const delta=clamp((now-last)/1000,0,.06);last=now;
    clock+=delta*config.speed/42;
    const easing=1-Math.exp(-12*delta);
    pointer.x+=(targetPointer.x-pointer.x)*easing;
    pointer.y+=(targetPointer.y-pointer.y)*easing;
    pointer.inside=targetPointer.inside;
    draw();frame=requestAnimationFrame(tick);
  }
  function setPlaying(next){
    if(destroyed)return false;
    next=Boolean(next)&&!media.matches&&!document.hidden;
    if(running===next)return running;
    running=next;cancelAnimationFrame(frame);
    if(running){last=performance.now();frame=requestAnimationFrame(tick);}
    else renderOnce();
    onStateChange(running);return running;
  }
  function configure(update){
    if(update.scene&&!scenes.some(scene=>scene.id===update.scene))return;
    config={...config,...update};
    config.density=clamp(Number(config.density)||58,15,90);
    config.depth=clamp(Number(config.depth)||0,0,100);
    config.speed=clamp(Number(config.speed)||1,1,100);
    config.hue=clamp(Number(config.hue)||0,0,360);
    renderOnce();
  }
  function resize(){
    if(destroyed)return false;
    const rect=canvas.getBoundingClientRect();
    if(rect.width<=0||rect.height<=0)return false;
    // Prevent oversize backing buffers on high-DPI desktop and mobile devices.
    const maxDpr=Math.sqrt(1600000/(rect.width*rect.height));
    const dpr=Math.min(clamp(window.devicePixelRatio||1,1,2),maxDpr);
    width=rect.width;height=rect.height;
    const nextWidth=Math.max(1,Math.round(width*dpr));
    const nextHeight=Math.max(1,Math.round(height*dpr));
    // Assigning width/height clears the bitmap, even when unchanged.
    if(canvas.width!==nextWidth||canvas.height!==nextHeight){
      canvas.width=nextWidth;canvas.height=nextHeight;
    }
    // DPR can change without a pixel-size change; always keep the transform current.
    ctx.setTransform(dpr,0,0,dpr,0,0);
    renderOnce();
    return true;
  }
  function renderForExport(){
    // Canvas.toBlob() may snapshot before a queued animation frame executes.
    // Flush the latest scene and responsive size synchronously for that export.
    if(destroyed||running||!resize())return false;
    if(redrawFrame){
      cancelAnimationFrame(redrawFrame);
      redrawFrame=0;
      queued=false;
    }
    draw();
    return true;
  }
  function move(event){
    const rect=canvas.getBoundingClientRect();
    if(!rect.width||!rect.height)return;
    targetPointer={x:clamp((event.clientX-rect.left)/rect.width*2-1,-1,1),y:clamp((event.clientY-rect.top)/rect.height*2-1,-1,1),inside:true};
    if(!running){pointer={...targetPointer};renderOnce();}
  }
  function leave(){targetPointer.inside=false;if(!running){pointer.inside=false;renderOnce();}}
  function onKeyDown(event){
    if(event.altKey||event.ctrlKey||event.metaKey)return;
    const increments={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
    const direction=increments[event.key];
    if(!direction&&event.key!=='Home')return;
    event.preventDefault();
    if(event.key==='Home'){
      targetPointer={x:0,y:0,inside:false};
    }else{
      const step=event.shiftKey ? 0.30 : 0.15;
      const base=targetPointer.inside?targetPointer:{x:0,y:0};
      targetPointer={
        x:clamp(base.x+direction[0]*step,-1,1),
        y:clamp(base.y+direction[1]*step,-1,1),
        inside:true,
      };
    }
    if(!running){pointer={...targetPointer};renderOnce();}
  }
  function onVisibility(){if(document.hidden)setPlaying(false);}
  function onReduced(){if(media.matches)setPlaying(false);renderOnce();}
  const observer=new ResizeObserver(resize);observer.observe(canvas);
  canvas.addEventListener('pointermove',move,{passive:true});
  canvas.addEventListener('pointerleave',leave);
  canvas.addEventListener('pointercancel',leave);
  canvas.addEventListener('keydown',onKeyDown);
  canvas.addEventListener('blur',leave);
  document.addEventListener('visibilitychange',onVisibility);
  media.addEventListener('change',onReduced);
  resize();
  return { configure,setPlaying,resize,renderForExport,
    get running(){return running},get settings(){return {...config}},
    destroy(){if(destroyed)return;setPlaying(false);destroyed=true;cancelAnimationFrame(frame);cancelAnimationFrame(redrawFrame);observer.disconnect();canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerleave',leave);canvas.removeEventListener('pointercancel',leave);canvas.removeEventListener('keydown',onKeyDown);canvas.removeEventListener('blur',leave);document.removeEventListener('visibilitychange',onVisibility);media.removeEventListener('change',onReduced);},
  };
}