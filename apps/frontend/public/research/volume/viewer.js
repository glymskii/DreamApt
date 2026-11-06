import * as T from './three.module.js';
import {OrbitControls} from './OrbitControls.js';
import {makeCloud} from './cloud.js';
import {tracerLayer} from './tracers.js';
import {createAirflow} from './airflow.js';
import {windArrows} from './wind-arrows.js';
import {daylight,clockText} from './daylight.js';
import {seasons,bytes,data,unzip,loadDay,loadField} from './profiles.js';
const $=x=>document.getElementById(x), url=n=>new URL('./'+n,import.meta.url);
const families={plant:'ТЭЦ и тепловой комплекс',registry:'Экореестр и разрешения',estate:'Именованные промтерритории',osm:'Промобъекты, трубы, карьеры OSM',village:'Жилые массивы до газификации',candidate:'Кандидат: частный сектор'};
const palette={plant:0xffb967,registry:0xf1da9c,estate:0xb7c6cc,osm:0x84bfb7,village:0x9ce39e,candidate:0xaad9a4,station:0xe9f7ff};
const displayNames={analysis:'Расчёт + станции',transport:'Только перенос',buildings:'Только здания · сценарий',power:'Только энергетика · сценарий'};
async function main(){
 const query = new URLSearchParams(location.search);
 const archive = query.has('episode');
 if(!archive){
   if(seasons.includes(query.get('season'))) $('season').value=query.get('season');
   if(/^[0-6]$/.test(query.get('day'))) $('weekday').value=query.get('day');
 }
 const start=Number(query.get('hour'));
 const pinnedHour=!archive&&query.has('hour')&&Number.isFinite(start)&&start>=0&&start<24;
 const cutoffFor = (scenario,season) => ({power:4,buildings:8})[scenario] ?? (archive?20:{winter:18,spring:10,summer:6,autumn:10}[season]);
 let manualCutoff=false;
 let season = $('season').value, weekday = Number($('weekday').value);
 const [city,m,trbuf] = await Promise.all([data('city.json'),data(archive?'model.json':'typical/index.json'),bytes('terrain.bin')]);
 const duration = archive ? 72 : 24;
 let currentDay, windLevels, initialField;
 if (archive) {
   const [upper,field]=await Promise.all([unzip('tracer-wind.bin.gz'),loadField(m,duration,'analysis.bin.gz')]);
   windLevels=new Int16Array(upper);initialField=field;
   $('profilePicker').hidden=true;
   $('subtitle').textContent='PM2.5 · Эпизод 24–26 декабря 2024';
   $('methodLink').href='volume/method.html';
   $('otherMode').href='almaty-volume.html';$('otherMode').textContent='Вернуться к типичным суткам ↗';
   $('solarTrack').classList.remove('typical');
   $('ticks').replaceChildren(...['24 дек','25 дек','26 дек'].map(label=>Object.assign(document.createElement('span'),{textContent:label})));
 } else {
   currentDay=await loadDay(m,season,weekday,'analysis');
   windLevels=currentDay.windLevels;initialField=currentDay.field;
   $('cut').value=cutoffFor('analysis',season);
 }
 $('hour').max=archive?'4260':'1439';
 let ctx;const canvas=document.createElement('canvas');try{ctx=canvas.getContext('webgl2',{antialias:true,alpha:false,powerPreference:'high-performance'})}catch(e){}
 if(!ctx){$('status').textContent='Для объёмной карты включите аппаратное ускорение WebGL 2 или откройте её в Chrome/Safari. ';let a=document.createElement('a');a.href='almaty-air-2024-12.html';a.textContent='Почасовая карта';a.style.color='#ace5cb';$('status').append(a);return}
 const renderer=new T.WebGLRenderer({canvas,context:ctx,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.45));renderer.setClearColor(0x172c31);$('canvasHost').append(canvas);canvas.setAttribute('aria-label','Свободная 3D-камера над Алматы');
 const scene=new T.Scene(),camera=new T.PerspectiveCamera(43,1,.06,850),controls=new OrbitControls(camera,canvas);
 controls.enableDamping=true;controls.dampingFactor=.16;controls.minDistance=1.8;controls.maxDistance=170;controls.maxPolarAngle=Math.PI*.485;controls.minPolarAngle=.04;controls.screenSpacePanning=false;controls.zoomSpeed=1.15;controls.rotateSpeed=.7;
 const hemisphere=new T.HemisphereLight(0xe6efe5,0x778d85,2.05);scene.add(hemisphere);const sun=new T.DirectionalLight(0xffefcc,1.55);sun.position.set(-32,58,18);scene.add(sun);
 const [west,south,east,north]=city.bbox,ww=city.width,dd=city.depth,[tw,th]=city.terrain,dem=new Uint16Array(trbuf),[nx,ny,nz]=m.shape,vox=nx*ny*nz;
 function ground(x,z){const a=T.MathUtils.clamp(x/ww+.5,0,1)*(tw-1),b=T.MathUtils.clamp(z/dd+.5,0,1)*(th-1),i=Math.min(tw-2,Math.floor(a)),j=Math.min(th-2,Math.floor(b)),fx=a-i,fy=b-j;return (((1-fy)*((1-fx)*dem[j*tw+i]+fx*dem[j*tw+i+1])+fy*((1-fx)*dem[(j+1)*tw+i]+fx*dem[(j+1)*tw+i+1]))*.001-.45)*1.6}
 function world(lon,lat,offset=0){const x=((lon-west)/(east-west)-.5)*ww,z=(.5-(lat-south)/(north-south))*dd;return new T.Vector3(x,ground(x,z)+offset,z)}
 const position=[],uv=[],tri=[];for(let j=0;j<th;j++)for(let i=0;i<tw;i++){let x=(i/(tw-1)-.5)*ww,z=(j/(th-1)-.5)*dd;position.push(x,(dem[j*tw+i]*.001-.45)*1.6,z);uv.push(i/(tw-1),1-j/(th-1));if(i<tw-1&&j<th-1){let k=j*tw+i;tri.push(k,k+tw,k+1,k+1,k+tw,k+tw+1)}}
 const terrain=new T.BufferGeometry();terrain.setAttribute('position',new T.Float32BufferAttribute(position,3));terrain.setAttribute('uv',new T.Float32BufferAttribute(uv,2));terrain.setIndex(tri);terrain.computeVertexNormals();
 const tex=await new T.TextureLoader().loadAsync(url('basemap.webp').href);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
 const land=new T.Mesh(terrain,new T.MeshLambertMaterial({map:tex}));scene.add(land);
 // Give the live terrain a real south/north/east/west profile.
 const sides=[],idx=[];function wall(ids){for(let l=0;l<ids.length-1;l++){let a=ids[l],b=ids[l+1],k=sides.length/3;for(const [s,low] of [[a,0],[b,0],[a,1],[b,1]])sides.push(position[3*s],low?-.38:position[3*s+1],position[3*s+2]);idx.push(k,k+1,k+2,k+1,k+3,k+2)}}wall(Array.from({length:tw},(_,i)=>i));wall(Array.from({length:tw},(_,i)=>(th-1)*tw+i));wall(Array.from({length:th},(_,i)=>i*tw));wall(Array.from({length:th},(_,i)=>i*tw+tw-1));let sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(sides,3));sg.setIndex(idx);scene.add(new T.Mesh(sg,new T.MeshBasicMaterial({color:0x3e554f,side:T.DoubleSide})));
 const component=new Uint8Array(dem.length*4);for(let i=0;i<dem.length;i++){component[4*i]=dem[i]>>8;component[4*i+1]=dem[i]&255;component[4*i+3]=255}
 const ht=new T.DataTexture(component,tw,th,T.RGBAFormat);ht.minFilter=ht.magFilter=T.LinearFilter;ht.needsUpdate=true;
 const box=makeCloud(ww,dd,18,ht,nz*m.spacing[2]/1000,m.cap);scene.add(box);const un=box.userData.params;const airflow=createAirflow(m,ww,dd,windLevels,!archive);
 const tickPM=tracerLayer({scene,ground,m,ww,dd,un,airflow,loop:!archive});
 const arrows=windArrows(scene,ww,dd,ground,airflow);
 const updateSun=daylight(scene,hemisphere,sun,un);
 const markerGeo={plant:new T.CylinderGeometry(.23,.34,1.15,9),registry:new T.BoxGeometry(.35,.58,.35),estate:new T.OctahedronGeometry(.21),osm:new T.ConeGeometry(.205,.50,6),village:new T.OctahedronGeometry(.34),candidate:new T.OctahedronGeometry(.29),station:new T.SphereGeometry(.13,8,6)};
 const mats=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,new T.MeshBasicMaterial({color:v,depthTest:true})]));
 let selected=null;const records=[],tags=[],allowed=new Set(Object.keys(families));
 const icons=new Map();function pinIcon(k){if(!icons.has(k)){let c=document.createElement('canvas');c.width=c.height=32;let x=c.getContext('2d');x.beginPath();x.arc(16,16,11,0,7);x.fillStyle='#'+new T.Color(palette[k]).getHexString();x.fill();x.strokeStyle='#223831';x.lineWidth=4;x.stroke();let map=new T.CanvasTexture(c);map.colorSpace=T.SRGBColorSpace;icons.set(k,new T.SpriteMaterial({map,transparent:true,depthWrite:false,depthTest:true}))}return icons.get(k)}
 function marker(p,kind){let pos=world(p.lon,p.lat),offset={plant:.57,registry:.3,osm:.25,station:.16}[kind]??.34;const mesh=new T.Mesh(markerGeo[kind],mats[kind]);mesh.position.copy(pos);mesh.position.y+=offset;mesh.renderOrder=10;scene.add(mesh);let pin=new T.Sprite(pinIcon(kind));pin.position.y=offset+.075;let size=kind==='plant'?.75:kind==='station'?.27:.42;pin.scale.set(size,size,1);pin.renderOrder=16;mesh.add(pin);let rec={...p,kind,mesh,pos};records.push(rec);mesh.userData.r=rec;return rec}
 for(const p of city.facilities)marker(p,p.kind);m.sites.forEach((site,index)=>marker({...site,index},'station'));
 function tag(rec,style,label,offset=.6){let el=document.createElement('div');el.className='tag '+style;el.textContent=label;$('annotations').append(el);tags.push({rec,el,style,offset});return el}
 for(let r of records)if(['plant','village','candidate'].includes(r.kind))tag(r,'',r.name,.85);
 const areas=[['Алатауский',76.802,43.324],['Жетысуский',76.935,43.342],['Турксибский',77.038,43.357],['Алмалинский',76.918,43.255],['Ауэзовский',76.858,43.218],['Наурызбайский',76.797,43.18],['Бостандыкский',76.900,43.162],['Медеуский',77.024,43.196]];
 for(const [name,lo,la] of areas)tag({pos:world(lo,la)},'district',name,.08);
 const focusTag=tag({pos:new T.Vector3()},'focus','',.82);focusTag.hidden=true;
 let buildingMesh;async function loadBuildings(){try{const feats=JSON.parse(new TextDecoder().decode(await unzip('buildings.json.gz'))),vs=[],idx=[];for(const [h,measured,pts] of feats){let ring=pts.map(([a,b])=>new T.Vector2((a/65535-.5)*ww,(.5-b/65535)*dd));let ctr=ring[0],g=ground(ctr.x,ctr.y),base=vs.length/3,n=ring.length;for(let dup of [0,1])for(let p of ring)vs.push(p.x,g+.010+dup*h*.0016,p.y);for(let f of T.ShapeUtils.triangulateShape(ring,[]))idx.push(base+n+f[2],base+n+f[1],base+n+f[0]);for(let i=0;i<n;i++){let j=(i+1)%n;idx.push(base+i,base+j,base+i+n,base+j,base+j+n,base+i+n)}}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vs,3));g.setIndex(idx);g.computeVertexNormals();buildingMesh=new T.Mesh(g,new T.MeshLambertMaterial({color:0xa2afa6,side:T.DoubleSide}));scene.add(buildingMesh)}catch(e){console.warn('Building LOD',e.message)}}loadBuildings();
 let fields={analysis:initialField};
 function texture(arr,index){let d=new T.Data3DTexture(arr.subarray(index*vox,(index+1)*vox),nx,ny,nz);d.format=T.RedFormat;d.minFilter=d.magFilter=T.LinearFilter;d.unpackAlignment=1;d.needsUpdate=true;return d}
 let frame=pinnedHour?start:(archive?44:8.35),playing=!pinnedHour&&!matchMedia('(prefers-reduced-motion: reduce)').matches,mode='analysis',prevFrame=-1,lastMode='',pending=0,loading=false;
 let lastMinute=-1,chartedDay=null;
 let chartY=[];
 function showMeasurements(hour){
   if(currentDay!==chartedDay){
     chartedDay=currentDay;
     const means=currentDay.sites.map(row=>row.reduce((sum,site)=>sum+site[0],0)/row.length);
     const ceiling=Math.max(100,Math.ceil(Math.max(...means)/50)*50);
     chartY=means.map(value=>30-27*value/ceiling);
     const line=chartY.map((y,i)=>(i?'L':'M')+(3+i*8)+' '+y.toFixed(2)).join(' ');
     $('networkLine').setAttribute('d',line);
     $('networkArea').setAttribute('d',line+' L187 30 H3 Z');
     $('networkChart').hidden=false;
     $('networkChart').setAttribute('aria-label','Среднее PM2.5 по '+m.sites.length+' станциям. '+means.map((v,i)=>i+' ч — '+v.toFixed(1)).join(', ')+' мкг/м³');
   }
   $('networkDot').setAttribute('cx',3+hour*8);
   $('networkDot').setAttribute('cy',chartY[hour]);
 }
 function updateF(){
   const i=Math.min(duration-1,Math.floor(frame)), j=archive?Math.min(i+1,71):(i+1)%24;
   if(i!==prevFrame||mode!==lastMode){
     for(const k of ['field','fieldNext']) un[k].value?.dispose();
     un.field.value=texture(fields[mode],i); un.fieldNext.value=texture(fields[mode],j);
     prevFrame=i;lastMode=mode;if(selected)detailValue();
     if(!archive){
       showMeasurements(i);
       const readings=currentDay.sites[i];
       const average=readings.reduce((sum,site)=>sum+site[0],0)/readings.length;
       $('networkMean').hidden=false;
       $('networkMean').textContent='Среднее на постах　'+average.toLocaleString('ru-RU',{maximumFractionDigits:1})+' мкг/м³';
     }
   }
   const minute=Math.floor(frame*60+1e-6);
   if(minute!==lastMinute){
     $('time').textContent=(archive?m.time[i].slice(8,10)+' дек · ':'')+clockText(frame%24);
     $('hour').setAttribute('aria-valuetext',$('time').textContent);
     lastMinute=minute;
   }
   un.mixHour.value=frame-i;
   $('hour').value=String(minute);
 }
 function method(){
   if(archive){
     $('methodText').textContent='Проверка на '+m.holdout.length+' станциях. Средняя абсолютная ошибка у земли '+m.metrics.analysis.mae+' мкг/м³.';
   }else{
     const summary=m.summaries[seasons.indexOf(season)];
     $('methodText').textContent=m.period.join('–')+' · '+m.sites.length+' станций · '+m.minSamples+'–'+m.maxSamples+' дат на часовое среднее. Ошибка сезонного профиля на контрольных станциях '+summary.validationMAE+' мкг/м³.';
   }
 }
 async function selectProfile(){
   const requestedSeason=$('season').value,requestedDay=Number($('weekday').value),requestedMode=$('scenario').value;
   const token=++pending, changed=!archive&&(season!==requestedSeason||weekday!==requestedDay);
   loading=true;$('status').hidden=false;$('status').textContent='Загрузка…';
   try{
     let next,field;
     if(changed) next=await loadDay(m,requestedSeason,requestedDay,requestedMode);
     else field=fields[requestedMode]||await loadField(m,duration,archive?requestedMode+'.bin.gz':currentDay.directory+requestedMode+'.gz');
     if(token!==pending)return;
     if(next){
       currentDay=next;windLevels.set(next.windLevels);airflow.setFrame(frame,true);
       season=requestedSeason;weekday=requestedDay;fields={[requestedMode]:next.field};
     }else fields[requestedMode]=field;
     if(mode!==requestedMode)manualCutoff=false;
     if(!manualCutoff)$('cut').value=cutoffFor(requestedMode,season);
     mode=requestedMode;prevFrame=-1;lastMinute=-1;
     method();updateF();sync();$('status').hidden=true;
   }catch(error){
     if(token!==pending)return;
     $('season').value=season;$('weekday').value=weekday;$('scenario').value=mode;
     $('status').textContent='Загрузка не удалась. ';const dismiss=document.createElement('button');dismiss.textContent='Закрыть';dismiss.onclick=()=>$('status').hidden=true;$('status').append(dismiss);
     console.error(error);
   }finally{if(token===pending)loading=false;}
 }
 for(const id of ['season','weekday','scenario'])$(id).onchange=selectProfile;
 for(let [v,t] of [['buildings','Отопление зданий'],['power','Энергетика']])$('scenario').add(new Option(t,v));
 function playUI(){$('play').textContent=playing?'Ⅱ':'▶';$('play').ariaLabel=playing?'Пауза':'Воспроизвести'}
 $('play').onclick=()=>{playing=!playing;playUI()};$('hour').oninput=()=>{playing=false;playUI();frame=Number($('hour').value)/60;updateF()};
 function home(){controls.target.set(0,1.2,-.8);const gaze=new T.Vector3(21,29,-67).normalize();let dist=49;for(let k=0;k<90;k++){camera.position.copy(controls.target).addScaledVector(gaze,dist);camera.lookAt(controls.target);camera.updateMatrixWorld();let fits=true;for(const x of [-ww*.5,ww*.5])for(const z of [-dd*.5,dd*.5]){let v=new T.Vector3(x,ground(x,z),z).project(camera);if(Math.abs(v.x)>.94||v.y>.76||v.y<-.77)fits=false}if(fits)break;dist*=1.025}controls.update()}
 function zoom(k){const d=camera.position.clone().sub(controls.target);d.setLength(T.MathUtils.clamp(d.length()*k,controls.minDistance,controls.maxDistance));camera.position.copy(controls.target).add(d);controls.update()}
 $('home').onclick=home;$('zoomIn').onclick=()=>zoom(.69);$('zoomOut').onclick=()=>zoom(1.45);
 function detailValue(){
   if(!selected)return;
   const r=selected;
   if(r.kind==='station'){
     const hour=Math.floor(frame),v=archive?r.values[hour]:currentDay.sites[hour][r.index];
     const estimate=mode==='transport'?v[1]:mode==='analysis'?v[2]:'—';
     $('detailValue').textContent=(archive?'Пост ':'Среднее ')+(v[0]??'—')+' · модель '+estimate+' мкг/м³';
     $('detailNote').textContent=(archive?'':v[3]+' дат · ')+(r.held?'Контрольная станция':'Станция для поправки');
   }else{
     $('detailValue').textContent=families[r.kind];
     const note=r.note||'';
     $('detailNote').textContent=archive?note:note.split(' · площадка экореестра')[0].replace(/; работа 24–26.12 не подтверждена\./,'');
   }
 }
 function pick(r,fly=false){selected=r;$('detail').hidden=!r;focusTag.hidden=!r;if(!r)return;$('detailName').textContent=r.name;focusTag.textContent=r.name;tags[tags.length-1].rec=r;$('detailLink').hidden=!r.ref;if(r.ref)$('detailLink').href=r.ref;detailValue();if(fly){let dir=camera.position.clone().sub(controls.target).normalize();controls.target.copy(r.pos);camera.position.copy(r.pos).addScaledVector(dir,19);controls.update()}};
 $('hideDetail').onclick=()=>pick(null);const ray=new T.Raycaster(),mouse=new T.Vector2();let press=null;canvas.addEventListener('pointerdown',e=>{press=[e.clientX,e.clientY]});canvas.addEventListener('pointerup',e=>{if(!press||Math.hypot(e.clientX-press[0],e.clientY-press[1])>5)return;mouse.set(2*e.clientX/innerWidth-1,1-2*e.clientY/innerHeight);ray.setFromCamera(mouse,camera);let hit=ray.intersectObjects(records.filter(r=>r.mesh.visible).map(r=>r.mesh),false)[0];if(hit)pick(hit.object.userData.r)});
 function filters(){for(let r of records)r.mesh.visible=r.kind==='station'?$('stationOn').checked:allowed.has(r.kind);if(selected&&!selected.mesh.visible)pick(null);let q=$('query').value.toLowerCase(),l=$('list');l.replaceChildren();for(let r of records.filter(r=>r.kind!=='station'&&allowed.has(r.kind)&&r.name.toLowerCase().includes(q))){let b=document.createElement('button');b.textContent=r.name;b.onclick=()=>{pick(r,true);$('sources').hidden=true};l.append(b)}}
 for(let [k,label] of Object.entries(families)){let cb=document.createElement('input');cb.type='checkbox';cb.checked=true;cb.onchange=()=>{cb.checked?allowed.add(k):allowed.delete(k);filters()};let lb=document.createElement('label');lb.append(label+' · '+records.filter(r=>r.kind===k).length,cb);$('typeFilters').append(lb)}
 $('sourceCount').textContent=city.facilities.length+' объектов и ориентиров · 8 районов';$('query').oninput=filters;$('stationOn').onchange=filters;
 for(let [btn,id,other] of [['showSettings','settings','sources'],['showSources','sources','settings']])$(btn).onclick=()=>{$(id).hidden=!$(id).hidden;$(other).hidden=true};
 function sync(){box.visible=$('cloudOn').checked;arrows.mesh.visible=$('windOn').checked;
   $('windSettings').hidden=!arrows.mesh.visible;
   $('windLegend').hidden=!arrows.mesh.visible;
   $('windLegend').textContent='➜　Ветер · '+$('windLevel').value+' м';
   un.cutoff.value=+$('cut').value;un.intensity.value=+$('opacity').value/100;un.aglScale.value=+$('exag').value;un.slicer.value=+$('slice').value/100;un.isoMode.value=$('form').value==='shell'?1:0;$('cutText').textContent=$('legendMin').textContent=$('cut').value;$('modeLabel').textContent=displayNames[mode]+'　·　высота облака ×'+$('exag').value;}for(let k of ['cloudOn','windOn','windLevel','cut','opacity','exag','slice','form'])$(k).oninput=sync;
 $('cut').addEventListener('input',()=>{manualCutoff=true;});
 method();
 function resize(){renderer.setSize(innerWidth,innerHeight);camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix()}addEventListener('resize',resize);resize();home();filters();sync();updateF();playUI();$('status').hidden=true;document.querySelectorAll('[data-loading]').forEach(el=>el.inert=false);
 const temp=new T.Vector3();function labels(){const used=[];for(let v of tags){if(v.el===focusTag&&!selected){v.el.hidden=true;continue}let vis=v.style==='district'?$('districtOn').checked:v.rec.mesh?v.rec.mesh.visible:true;temp.copy(v.rec.pos);temp.y+=v.offset;temp.project(camera);vis=vis&&Math.abs(temp.x)<.99&&Math.abs(temp.y)<.96&&temp.z>0&&temp.z<1;let X=(temp.x*.5+.5)*innerWidth+5,Y=(.5-temp.y*.5)*innerHeight-6,rect=[X,Y,X+v.el.textContent.length*6.4,Y+14];if(vis&&v.style==='district'&&used.some(r=>rect[0]<r[2]&&r[0]<rect[2]&&rect[1]<r[3]&&r[1]<rect[3]))vis=false;if(vis)used.push(rect);v.el.hidden=!vis;if(vis)v.el.style.transform='translate('+Math.round((temp.x*.5+.5)*innerWidth+5)+'px,'+Math.round((.5-temp.y*.5)*innerHeight-6)+'px)'}$('north').style.transform='rotate('+(-controls.getAzimuthalAngle())+'rad)'}
 const key=e=>{if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName))return;let d=camera.position.clone().sub(controls.target);if(e.key==='ArrowLeft'||e.key==='ArrowRight'){d.applyAxisAngle(new T.Vector3(0,1,0),e.key==='ArrowLeft'?-.12:.12);camera.position.copy(controls.target).add(d)}else if(e.key==='+')zoom(.8);else if(e.key==='-')zoom(1.2);else if(e.key==='Escape'){$('sources').hidden=$('settings').hidden=true;pick(null)}else return;e.preventDefault()};addEventListener('keydown',key);
 let last=performance.now();
 const hoursPerSecond=.52;
 function draw(now){
   requestAnimationFrame(draw);
   const seconds=Math.min(.22,Math.max(0,(now-last)/1000));
   last=now;
   if(document.hidden)return;
   const advanceHours=playing&&!loading?seconds*hoursPerSecond*Number($('pace').value):0;
   if(advanceHours>0){frame=(frame+advanceHours)%duration;updateF();}
   airflow.setFrame(frame);
   controls.update();
   if(buildingMesh)buildingMesh.visible=camera.position.distanceTo(controls.target)<55;
   arrows.draw(camera,controls.target,Number($('windDensity').value),Number($('windLevel').value)/1000,un.aglScale.value,advanceHours);
   tickPM(frame,fields[mode],box.visible&&$('pmOn').checked,advanceHours);
   labels();
   updateSun(archive?null:seasons.indexOf(season),frame%24,Math.floor(frame/24),camera);
   renderer.render(scene,camera);
 }
 requestAnimationFrame(draw);
}
main().catch(e=>{console.error(e);$('status').textContent='Сцена не загрузилась: '+e.message+' · обновите страницу.'});
