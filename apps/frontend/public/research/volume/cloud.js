// March front-to-back through a 3D field, following height above the actual DEM.
import * as T from './three.module.js';
export function makeCloud(width,depth,top,heightTex,aglMax,cap) {
 const U={sunDirection:{value:new T.Vector3(0,1,0)},daylight:{value:1},boxSize:{value:new T.Vector3(width,top,depth)},dem:{value:heightTex},field:{value:null},fieldNext:{value:null},mixHour:{value:0},cutoff:{value:20},intensity:{value:.87},aglScale:{value:6},aglMax:{value:aglMax},logcap:{value:Math.log1p(cap)},slicer:{value:1},sampN:{value:128},isoMode:{value:0}};
 const material=new T.ShaderMaterial({glslVersion:T.GLSL3,uniforms:U,side:T.BackSide,transparent:true,depthWrite:false,depthTest:false,
 vertexShader:`out vec3 worldPoint; void main(){vec4 p=modelMatrix*vec4(position,1.);worldPoint=p.xyz;gl_Position=projectionMatrix*viewMatrix*p;}`,
 fragmentShader:`precision highp float; precision highp sampler3D;
 in vec3 worldPoint;out vec4 outColor; uniform vec3 boxSize,sunDirection;uniform float daylight;uniform sampler2D dem;
 uniform sampler3D field,fieldNext;uniform float mixHour,cutoff,intensity,aglScale,aglMax,logcap,slicer;uniform int sampN,isoMode;
 float height(vec2 uv){vec2 h=texture(dem,uv).rg;return (dot(h,vec2(65280.,255.))*.001-.45)*1.6;}
 float conc(vec3 uv){return mix(exp(texture(field,uv).r*logcap),exp(texture(fieldNext,uv).r*logcap),mixHour)-1.;}
 void main(){vec3 dir=normalize(worldPoint-cameraPosition);
 vec3 lo=vec3(-boxSize.x*.5,-.5,-boxSize.z*.5), hi=vec3(boxSize.x*.5,boxSize.y-.5,boxSize.z*.5);
 vec3 inv=1./(dir+vec3(1e-8));vec3 tt0=(lo-cameraPosition)*inv,tt1=(hi-cameraPosition)*inv;
 vec3 v0=min(tt0,tt1),v1=max(tt0,tt1);float first=max(0.,max(v0.x,max(v0.y,v0.z)));float last=min(v1.x,min(v1.y,v1.z));if(last<=first) discard;
 float ds=(last-first)/float(sampN);float jitter=fract(sin(dot(floor(gl_FragCoord.xy),vec2(12.9898,78.233)))*43758.5453);if(isoMode==1)jitter=.5;vec3 sum=vec3(0.);float a=0.;float prevC=0.;
 for(int i=0;i<170;i++){if(i>=sampN)break;vec3 p=cameraPosition+dir*(first+(float(i)+jitter)*ds);
 vec2 uv=p.xz/boxSize.xz+.5;float alt=(p.y-height(uv))/aglScale;
 if(alt<-.003)break;if(alt<0.||alt>aglMax||uv.x>slicer)continue;
 vec3 tc=vec3(uv.x,1.-uv.y,alt/aglMax);float val=conc(tc);float amount=max(val-cutoff,0.);if(amount<.05){prevC=val;continue;}
 if(isoMode==1){if(prevC<cutoff){float f=clamp((val-cutoff)/max(.001,val-prevC),0.,1.);vec3 pp=p-dir*ds*f;vec2 eu=pp.xz/boxSize.xz+.5;tc=clamp(vec3(eu.x,1.-eu.y,(pp.y-height(eu))/aglScale/aglMax),0.,1.); vec3 grad=vec3(conc(tc+vec3(.012,0,0))-conc(tc-vec3(.012,0,0)),(conc(tc+vec3(0,0,.035))-conc(tc-vec3(0,0,.035)))*2.,conc(tc-vec3(0,.012,0))-conc(tc+vec3(0,.012,0)));vec3 norm=-normalize(grad+vec3(.0001));float lit=.32+.68*max(0.,dot(norm,normalize(sunDirection)));vec3 shell=mix(vec3(.97,.81,.47),vec3(.77,.34,.22),smoothstep(20.,120.,cutoff));sum+=(1.-a)*.72*shell*lit;a+=(1.-a)*.72;}prevC=val;continue;} prevC=val;
 float u=clamp(val/150.,0.,1.);vec3 col=mix(vec3(.95,.85,.63),vec3(.87,.51,.30),smoothstep(.10,.70,u));col=mix(col,vec3(.58,.245,.21),smoothstep(.62,1.,u));
 float glow=clamp((val-conc(clamp(tc+vec3(-.011,.009,.065),0.,1.)))/80.,-.28,.35);col*=.94+.32*glow;col*=mix(vec3(.68,.71,.80),vec3(1.),daylight);
 float alpha=1.-exp(-amount*.0135*intensity*ds);sum+=(1.-a)*alpha*col;a+=(1.-a)*alpha;if(a>.985)break;}
 if(a<.004)discard;outColor=vec4(sum/max(a,.0001),a);}`});
 const mesh=new T.Mesh(new T.BoxGeometry(width,top,depth),material);mesh.position.y=top*.5-.5;mesh.renderOrder=8;mesh.userData.params=U;return mesh;
}
