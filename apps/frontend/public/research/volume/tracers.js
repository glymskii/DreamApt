// Particles visualize the excess concentration in the numerical field.
import * as T from './three.module.js';
import {advect} from './airflow.js';

export function tracerLayer({scene, ground, m, ww, dd, un, airflow, loop}) {
  const capacity=2000, [nx,ny,nz]=m.shape, plane=nx*ny, frameSize=plane*nz;
  const dz=m.spacing[2]/1000;
  const concentration=Float32Array.from({length:256},(_,i)=>Math.expm1(i*Math.log1p(m.cap)/255));
  const position=new Float32Array(capacity*3), tint=new Float32Array(capacity*3);
  const world=new Float32Array(capacity*3), ages=new Float32Array(capacity), lives=new Float32Array(capacity);
  const opacity=new Float32Array(capacity), cdf=new Float64Array(frameSize);
  const geometry=new T.BufferGeometry();
  for(const [name,array,size] of [['position',position,3],['color',tint,3],['visibility',opacity,1]])
    geometry.setAttribute(name,new T.BufferAttribute(array,size).setUsage(T.DynamicDrawUsage));
  const material=new T.ShaderMaterial({vertexColors:true,transparent:true,depthWrite:false,
    vertexShader:`attribute float visibility;varying vec4 shade;void main(){
      vec4 eye=modelViewMatrix*vec4(position,1.);
      gl_PointSize=clamp(32./max(-eye.z,1.)+1.2,1.5,4.2);
      gl_Position=projectionMatrix*eye;shade=vec4(color,visibility);}`,
    fragmentShader:`varying vec4 shade;void main(){float r=length(gl_PointCoord-.5)*2.;
      if(r>1.)discard;gl_FragColor=vec4(shade.rgb,.7*shade.a*(1.-smoothstep(.35,1.,r)));}`});
  const points=new T.Points(geometry,material);
  points.frustumCulled=false;points.renderOrder=9;scene.add(points);

  let seed=251224,previous=null,lastHour=-1,lastCut=-1,priorCount=0,mass=0;
  const cache=new WeakMap();
  const velocity={x:0,z:0};
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function masses(field,cut){
    let entry=cache.get(field);
    if(!entry){
      const hours=field.length/frameSize, histogram=new Uint32Array(hours*256);
      for(let h=0;h<hours;h++)for(let i=0;i<frameSize;i++)histogram[256*h+field[h*frameSize+i]]++;
      entry={histogram,hours,cut:NaN};cache.set(field,entry);
    }
    if(entry.cut!==cut){
      entry.totals=Array.from({length:entry.hours},(_,h)=>{
        let sum=0;
        for(let c=0;c<256;c++)sum+=entry.histogram[h*256+c]*Math.max(0,concentration[c]-cut);
        return sum;
      });
      entry.cut=cut;
    }
    return entry.totals;
  }
  function seedAt(k,existing){
    let lo=0,hi=frameSize-1,draw=random()*mass;
    while(lo<hi){const mid=(lo+hi)>>>1;if(cdf[mid]<=draw)lo=mid+1;else hi=mid;}
    world[k*3]=((lo%nx+random())/nx-.5)*ww;
    world[k*3+1]=(Math.floor(lo/plane)+random())*dz;
    world[k*3+2]=(.5-(Math.floor(lo/nx)%ny+random())/ny)*dd;
    lives[k]=1+random()*2.5;ages[k]=existing?lives[k]*(.1+.8*random()):0;
  }
  return function tick(frame,field,enabled,modelHours){
    points.visible=enabled;
    if(!enabled)return;
    const hour=Math.floor(frame),cut=un.cutoff.value,totals=masses(field,cut);
    const next=loop?(hour+1)%totals.length:Math.min(hour+1,totals.length-1);
    // If the current field is empty, seed from the field fading in.
    const source=totals[hour]>0?hour:next;
    const reset=previous!==field||lastCut!==cut||Math.abs(lastHour-source)>1;
    if(previous!==field||lastCut!==cut||lastHour!==source){
      mass=0;
      for(let i=0;i<frameSize;i++){mass+=Math.max(0,concentration[field[source*frameSize+i]]-cut);cdf[i]=mass;}
      previous=field;lastCut=cut;lastHour=source;
    }
    const mix=frame-hour;
    const burden=totals[hour]+(totals[next]-totals[hour])*mix;
    // Fixed scale on this grid, shared by every season/day and the archive.
    const count=mass>0?Math.min(capacity,Math.round(burden/80)):0;
    geometry.setDrawRange(0,count);
    for(let k=0;k<count;k++){
      if(reset||k>=priorCount||ages[k]>=lives[k])seedAt(k,reset||k>=priorCount);
      const o=k*3;
      if(modelHours>0){
        airflow.sample(world[o],world[o+1],world[o+2],velocity);
        advect(world,o,velocity,modelHours);ages[k]+=modelHours;
      }
      const x=world[o],z=world[o+2],h=world[o+1];
      const ix=T.MathUtils.clamp(Math.floor((x/ww+.5)*nx),0,nx-1);
      const iy=T.MathUtils.clamp(Math.floor((.5-z/dd)*ny),0,ny-1);
      const iz=T.MathUtils.clamp(Math.floor(h/dz),0,nz-1),idx=(iz*ny+iy)*nx+ix;
      const a=concentration[field[hour*frameSize+idx]],b=concentration[field[next*frameSize+idx]];
      const pm=a+(b-a)*mix;
      const outside=Math.abs(x)>ww/2||Math.abs(z)>dd/2;
      if(outside||pm<cut)ages[k]=lives[k];
      opacity[k]=x/ww+.5<=un.slicer.value?Math.max(0,Math.min(1,ages[k]/.12,(lives[k]-ages[k])/.14)):0;
      position[o]=x;position[o+1]=ground(x,z)+h*un.aglScale.value+.015;position[o+2]=z;
      const warmth=Math.min(1,pm/180);
      tint[o]=1;tint[o+1]=.92-.32*warmth;tint[o+2]=.64-.35*warmth;
    }
    priorCount=count;
    for(const key of ['position','color','visibility'])geometry.attributes[key].needsUpdate=true;
  };
}
