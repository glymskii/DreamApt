// Archived winds: cm/s, east and north, on every fifth horizontal model cell.
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
const layers = [0, 2, 5, 10, 17];

export function createAirflow(model, width, depth, packed, loop) {
  const [nx, ny] = model.shape;
  const [, rows, columns] = model.windShape;
  const plane = rows * columns;
  const block = layers.length * plane;
  const hours = packed.length / (2 * block);
  if (!Number.isInteger(hours) || hours < 1) throw Error('Неверный размер поля ветра');
  const dz = model.spacing[2]/1000;
  let blended = new Float32Array(2 * block);
  let lastFrame = NaN;

  function setFrame(frame, force=false) {
    if (frame === lastFrame && !force) return;
    lastFrame = frame;
    const i = Math.floor(frame);
    const j = loop ? (i+1)%hours : Math.min(i+1, hours-1);
    const mix = frame-i, a = i*2*block, b = j*2*block;
    for (let k=0; k<blended.length; k++)
      blended[k] = (packed[a+k] + (packed[b+k]-packed[a+k])*mix)*.01;
  }

  function sample(x, heightKm, z, out) {
    const gx = clamp(((x/width+.5)*nx-.5)/5, 0, columns-1);
    const gy = clamp(((.5-z/depth)*ny-.5)/5, 0, rows-1);
    const gz = heightKm/dz-.5;
    const i = Math.floor(gx), j = Math.floor(gy);
    const right = Math.min(i+1,columns-1)-i;
    const up = (Math.min(j+1,rows-1)-j)*columns;
    const ix = j*columns+i, fx=gx-i, fy=gy-j;
    let level = 0;
    while (level < layers.length-2 && gz>layers[level+1]) level++;
    const mix = clamp((gz-layers[level])/(layers[level+1]-layers[level]),0,1);
    const base = level*plane+ix;
    function horizontal(k) {
      const near = blended[k]+fx*(blended[k+right]-blended[k]);
      const far = blended[k+up]+fx*(blended[k+up+right]-blended[k+up]);
      return near+(far-near)*fy;
    }
    const east = horizontal(base), north = horizontal(block+base);
    out.x = east+(horizontal(base+plane)-east)*mix;
    out.z = -(north+(horizontal(block+base+plane)-north)*mix);
  }
  return {sample, setFrame};
}

// One scene unit is one horizontal kilometre. Both layers advance on model time.
export function advect(points, index, velocity, modelHours) {
  const kmPerMeterPerSecond = 3.6 * modelHours;
  points[index] += velocity.x * kmPerMeterPerSecond;
  points[index+2] += velocity.z * kmPerMeterPerSecond;
}
