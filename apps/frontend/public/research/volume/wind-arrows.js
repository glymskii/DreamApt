import * as T from './three.module.js';
import {advect} from './airflow.js';

// Project the local wind tangent, then draw an outlined arrow in CSS pixels.
// Its tip is attached to the advected position at every zoom level.
const vertexShader = `
  attribute vec3 origin, tangent;
  attribute float magnitude;
  uniform vec2 viewport;
  varying vec2 local;
  varying float extent, activeWind;
  void main(){
    vec4 tip=projectionMatrix*modelViewMatrix*vec4(origin,1.);
    vec4 next=projectionMatrix*modelViewMatrix*vec4(origin+tangent*.025,1.);
    vec2 along=(next.xy/next.w-tip.xy/tip.w)*viewport;
    along/=max(length(along),.00001);
    vec2 across=vec2(-along.y,along.x);
    extent=clamp(7.+magnitude*2.3,8.,22.);
    activeWind=smoothstep(.04,.22,magnitude);
    local=vec2(mix(-extent-2.,2.,position.x),position.y*4.6);
    tip.xy+=(along*local.x+across*local.y)*2./viewport*tip.w;
    gl_Position=tip;
  }`;
const fragmentShader = `
  varying vec2 local;
  varying float extent, activeWind;
  float segment(vec2 p,vec2 a,vec2 b){
    vec2 ab=b-a;
    return length(p-a-ab*clamp(dot(p-a,ab)/dot(ab,ab),0.,1.));
  }
  void main(){
    float head=min(4.1,extent*.34);
    vec2 p=vec2(local.x,abs(local.y));
    float d=min(segment(p,vec2(-extent,0.),vec2(0.)),
                segment(p,vec2(-head,head*.64),vec2(0.)));
    float edge=1.-smoothstep(1.,1.68,d);
    float core=1.-smoothstep(.30,.92,d);
    float fade=mix(.25,.94,smoothstep(-extent,0.,local.x));
    float alpha=edge*activeWind*fade;
    if(alpha<.025)discard;
    gl_FragColor=vec4(mix(vec3(.04,.22,.26),vec3(.52,.97,1.),core),alpha);
  }`;

export function windArrows(scene, width, depth, ground, airflow) {
  const maximum=1800;
  const positions=new Float32Array(maximum*3);
  const centers=new Float32Array(maximum*3), tangents=new Float32Array(maximum*3);
  const speeds=new Float32Array(maximum);
  const geometry=new T.InstancedBufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute([0,-1,0,1,-1,0,1,1,0,0,1,0],3));
  geometry.setIndex([0,1,2,0,2,3]);
  for(const [name,array,size] of [['origin',centers,3],['tangent',tangents,3],['magnitude',speeds,1]])
    geometry.setAttribute(name,new T.InstancedBufferAttribute(array,size).setUsage(T.DynamicDrawUsage));
  const viewport=new T.Vector2();
  const material=new T.ShaderMaterial({uniforms:{viewport:{value:viewport}},vertexShader,fragmentShader,
    transparent:true,depthWrite:false,side:T.DoubleSide,forceSinglePass:true});
  const mesh=new T.Mesh(geometry,material);
  mesh.frustumCulled=false;
  mesh.renderOrder=9;
  scene.add(mesh);

  let patch=null, previousCount=0;
  const drift={x:0,z:0};
  let seed=1307;
  function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;}
  function place(target, distance, aspect, count) {
    const span=distance*Math.max(1,aspect)*1.7;
    const w=Math.min(width,span), d=Math.min(depth,span);
    const left=T.MathUtils.clamp(target.x-w/2,-width/2,width/2-w);
    const top=T.MathUtils.clamp(target.z-d/2,-depth/2,depth/2-d);
    if(patch && count===previousCount && Math.abs(w-patch.w)<.16*w && Math.abs(d-patch.d)<.16*d
       && Math.abs(left-patch.left)<.12*w && Math.abs(top-patch.top)<.12*d)return;
    patch={w,d,left,top};
    previousCount=count;
    const cols=Math.max(1,Math.round(Math.sqrt(count*w/d))), rows=Math.ceil(count/cols);
    seed=1307;
    for(let i=0;i<count;i++){
      positions[3*i]=left+((i%cols)+random())/cols*w;
      positions[3*i+2]=top+(Math.floor(i/cols)+random())/rows*d;
    }
  }
  function wrap(value,min,size){
    if(value>=min&&value<min+size)return value;
    return min+T.MathUtils.euclideanModulo(value-min,size);
  }
  function draw(camera, target, count, heightKm, exaggeration, modelHours) {
    if(!mesh.visible)return;
    viewport.set(innerWidth,innerHeight);
    place(target,camera.position.distanceTo(target),camera.aspect,count);
    geometry.instanceCount=count;
    for(let i=0;i<count;i++){
      const k=3*i;
      airflow.sample(positions[k],heightKm,positions[k+2],drift);
      advect(positions,k,drift,modelHours);
      const x=positions[k]=wrap(positions[k],patch.left,patch.w);
      const z=positions[k+2]=wrap(positions[k+2],patch.top,patch.d);
      const speed=Math.hypot(drift.x,drift.z);
      speeds[i]=speed;
      const gx=drift.x/Math.max(.001,speed), gz=drift.z/Math.max(.001,speed);
      const h=ground(x,z);
      centers[k]=x;centers[k+1]=h+heightKm*exaggeration+.015;centers[k+2]=z;
      tangents[k]=gx;tangents[k+1]=(ground(x+gx*.08,z+gz*.08)-h)/.08;tangents[k+2]=gz;
    }
    for(const key of ['origin','tangent','magnitude'])geometry.attributes[key].needsUpdate=true;
  }
  return {mesh,draw};
}
