export const seasons = ['winter','spring','summer','autumn'];
export const weekdays = ['Понедельник','Вторник','Среда','Четверг','Пятница','Суббота','Воскресенье'];
const local = name => new URL(name,import.meta.url);
async function response(name) {
  const result = await fetch(local(name));
  if (!result.ok) throw new Error(name+' · HTTP '+result.status);
  return result;
}
export async function data(name) {return (await response(name)).json();}
export async function bytes(name) {return (await response(name)).arrayBuffer();}
export async function unzip(name) {
  const buffer = await bytes(name);
  const header = new Uint8Array(buffer,0,2);
  if (header[0] !== 31 || header[1] !== 139) return buffer;
  const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

export async function loadDay(model, season, weekday, scenario) {
  const directory = 'typical/'+season+'/'+weekday+'/';
  const [windBuffer, sites, field] = await Promise.all([
    unzip(directory+'wind.gz'), data(directory+'sites.json'), loadField(model,24,directory+scenario+'.gz')
  ]);
  const windLevels = new Int16Array(windBuffer);
  const [,rows,cols] = model.windShape;
  const plane = rows*cols;
  if (windLevels.length !== 24*2*5*plane || sites.length !== 24) throw new Error('Размер профиля суток');
  return {directory,windLevels,sites,field};
}

export async function loadField(model, hours, path) {
  const field = new Uint8Array(await unzip(path));
  const voxels = model.shape.reduce((a,b)=>a*b);
  if (field.length !== hours*voxels) throw new Error('Размер поля PM2.5');
  return field;
}
