// NOAA solar equations averaged over the calendar dates of each meteorological season.
import * as T from './three.module.js';

const radians = Math.PI / 180;
const latitude = 43.24 * radians;
const longitude = 76.94;
const offset = 5;
const fullTurn = 2 * Math.PI;

function solarTerms(day, yearLength) {
  const g = fullTurn * (day - 1) / yearLength;
  return {
    declination: .006918 - .399912*Math.cos(g) + .070257*Math.sin(g)
      - .006758*Math.cos(2*g) + .000907*Math.sin(2*g) - .002697*Math.cos(3*g) + .00148*Math.sin(3*g),
    minutes: 229.18*(.000075 + .001868*Math.cos(g) - .032077*Math.sin(g)
      - .014615*Math.cos(2*g) - .040849*Math.sin(2*g))
  };
}

function seasonalTerms() {
  const results = Array.from({length:4}, () => ({declination:0, minutes:0, count:0}));
  for (const year of [2023, 2024]) {
    const length = year === 2024 ? 366 : 365;
    for (let day = 1; day <= length; day++) {
      const month = new Date(Date.UTC(year, 0, day)).getUTCMonth()+1;
      const season = Math.floor(month % 12 / 3);
      const terms = solarTerms(day, length);
      results[season].declination += terms.declination;
      results[season].minutes += terms.minutes;
      results[season].count++;
    }
  }
  return results.map(r => ({declination:r.declination/r.count, minutes:r.minutes/r.count}));
}

const seasons = seasonalTerms();
export function sunDay(season, episodeDay) {
  const {declination:d, minutes} = season === null ? solarTerms(359 + episodeDay, 366) : seasons[season];
  const noon = 12 + offset - longitude/15 - minutes/60;
  const arc = Math.acos((Math.sin(-.833*radians)-Math.sin(latitude)*Math.sin(d))
                       /(Math.cos(latitude)*Math.cos(d))) / radians / 15;
  return {d, noon, rise:noon-arc, set:noon+arc};
}

export function sunVector(day, hour, vector) {
  const angle = (hour-day.noon)*15*radians;
  const c = Math.cos(day.d);
  // World axes: +x east, +y up, -z north.
  return vector.set(-c*Math.sin(angle), Math.sin(latitude)*Math.sin(day.d)+Math.cos(latitude)*c*Math.cos(angle),
                    Math.sin(latitude)*c*Math.cos(angle)-Math.cos(latitude)*Math.sin(day.d));
}

export function clockText(hour) {
  const minutes = ((Math.floor(hour*60 + 1e-6)%1440)+1440)%1440;
  return String(Math.floor(minutes/60)).padStart(2,'0') + ':' + String(minutes%60).padStart(2,'0');
}

export function daylight(scene, hemisphere, light, cloud) {
  const direction = new T.Vector3();
  const sky = new T.Mesh(new T.SphereGeometry(400,48,24),new T.ShaderMaterial({
    side:T.BackSide,depthWrite:false,depthTest:false,
    uniforms:{sunDir:{value:direction}},
    vertexShader:`varying vec3 oriented;void main(){oriented=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec3 oriented;uniform vec3 sunDir;
    void main(){
      vec3 ray=normalize(oriented);float daylight=smoothstep(-.13,.32,sunDir.y);
      float twilight=exp(-abs(sunDir.y)*8.5);float horizon=exp(-abs(ray.y)*3.2);
      vec3 night=mix(vec3(.020,.039,.077),vec3(.080,.122,.170),horizon);
      vec3 sky=mix(vec3(.165,.314,.414),vec3(.420,.562,.585),horizon);
      vec3 color=mix(night,sky,daylight);float align=dot(ray,sunDir);
      color+=twilight*horizon*vec3(.52,.227,.085)*(.26+.74*pow(max(0.,align),5.));
      float visible=smoothstep(-.012,.005,sunDir.y);
      color+=visible*vec3(1.,.59,.24)*(.26*pow(max(align,0.),34.)+.41*pow(max(align,0.),580.));
      color=mix(color,vec3(1.,.94,.77),visible*smoothstep(.99981,.99995,align));
      gl_FragColor=vec4(color,1.);
    }`
  }));
  sky.renderOrder=-100;
  sky.frustumCulled=false;
  scene.add(sky);
  // A map-scale copy of the solar path keeps the sun visible above the terrain
  // when the camera is pitched down and the actual sky disk is outside the view.
  const orbitRadius = 29;
  const orbitCenter = new T.Vector3(0,1.4,0);
  const orbitMaterial = new T.LineDashedMaterial({
    color:0xffdf90, transparent:true, opacity:.45, dashSize:.42, gapSize:.42, depthWrite:false
  });
  const orbit = new T.Line(new T.BufferGeometry(),orbitMaterial);
  const disk = new T.Mesh(new T.SphereGeometry(.56,24,16),new T.MeshBasicMaterial({color:0xffe4a1}));
  const glowCanvas=document.createElement('canvas');
  glowCanvas.width=glowCanvas.height=64;
  const brush=glowCanvas.getContext('2d'), gradient=brush.createRadialGradient(32,32,0,32,32,32);
  gradient.addColorStop(0,'#fff6cfff');
  gradient.addColorStop(.17,'#ffdb80d9');
  gradient.addColorStop(.40,'#ffc26b54');
  gradient.addColorStop(1,'#ffb24a00');
  brush.fillStyle=gradient;
  brush.fillRect(0,0,64,64);
  const halo=new T.Sprite(new T.SpriteMaterial({map:new T.CanvasTexture(glowCanvas),
    transparent:true,depthWrite:false,blending:T.AdditiveBlending}));
  halo.scale.set(4.8,4.8,1);
  disk.add(halo);
  orbit.renderOrder=6;
  disk.renderOrder=7;
  scene.add(orbit,disk);
  const warm = new T.Color(0xffa85d), white = new T.Color(0xfff4d0);
  const night = new T.Color(0x9ab8df), dayColor = new T.Color(0xe5f2ef);
  const point = document.getElementById('sunPoint');
  const path = document.getElementById('sunPath');
  const rise = document.getElementById('sunrise');
  const set = document.getElementById('sunset');
  const phase = document.getElementById('sunPhase');
  const track = document.getElementById('solarTrack');
  let previousDay, previousPhase;
  const x = hour => 5 + hour/24*250;
  const y = altitude => 22 - Math.max(-.38,altitude)*19;
  const aux = new T.Vector3();
  return (season, hour, episodeDay, camera) => {
    const key = season === null ? 'date-'+episodeDay : season;
    if (previousDay?.key !== key) {
      previousDay = {...sunDay(season,episodeDay),key};
      const d = previousDay;
      const arcPoints = Array.from({length:97},(_,i)=>{
        const time=d.rise+(d.set-d.rise)*i/96;
        return sunVector(d,time,new T.Vector3()).multiplyScalar(orbitRadius).add(orbitCenter);
      });
      orbit.geometry.dispose();
      orbit.geometry=new T.BufferGeometry().setFromPoints(arcPoints);
      orbit.computeLineDistances();
      const points = Array.from({length:145},(_,i) => {
        const h = i/6;
        return (i===0?'M':'L')+x(h).toFixed(1)+' '+y(sunVector(d,h,aux).y).toFixed(1);
      });
      path.setAttribute('d',points.join(' '));
      for (const [el,hour] of [[rise,d.rise],[set,d.set]]) el.textContent=clockText(hour);
      document.querySelector('.solar').setAttribute('aria-label','Путь солнца. Восход '+clockText(d.rise)+', закат '+clockText(d.set));
      track.style.setProperty('--rise',(100*d.rise/24)+'%');
      track.style.setProperty('--set',(100*d.set/24)+'%');
    }
    sunVector(previousDay,hour,direction);
    const elevation = Math.asin(direction.y)/radians;
    disk.position.copy(direction).multiplyScalar(orbitRadius).add(orbitCenter);
    disk.visible=elevation>=-.833;
    orbitMaterial.opacity=disk.visible ? .45 : .15;
    const brightness = T.MathUtils.smoothstep(elevation,-8,18);
    const warmLight = T.MathUtils.smoothstep(elevation,-2,28);
    hemisphere.intensity=.66+1.20*brightness;
    hemisphere.color.copy(night).lerp(dayColor,brightness);
    light.position.copy(direction).multiplyScalar(100);
    light.intensity=1.65*T.MathUtils.smoothstep(elevation,-2,14);
    light.color.copy(warm).lerp(white,warmLight);
    cloud.sunDirection.value.copy(direction);
    cloud.daylight.value=brightness;
    sky.position.copy(camera.position);
    point.setAttribute('cx',x(hour));
    point.setAttribute('cy',y(direction.y));
    const label = elevation< -6?'Ночь':elevation<4?(hour<previousDay.noon?'Рассвет':'Сумерки'):'День';
    if (label!==previousPhase) {
      phase.textContent=label;
      point.setAttribute('fill',elevation< -6?'#adc8de':'#ffd389');
      previousPhase=label;
    }
  };
}
