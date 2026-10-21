const $ = id => document.getElementById(id);
const set = (id, value) => { $(id).textContent = value; };
const motionPreference = matchMedia('(prefers-reduced-motion: reduce)');
let paused = motionPreference.matches;
let automatic = true;
let pending = false;
let timer;
let responses = 0;
let previousIdentity;
let pulse = 0;
let accent = '#F4D64C';

const bytes = value => value === null || value === undefined ? 'Not available' : `${(value / 1024 / 1024).toFixed(1)} MiB`;
function uptime(seconds) {
  const n = Math.floor(seconds);
  if (n < 60) return `${n}s`;
  if (n < 3600) return `${Math.floor(n / 60)}m ${n % 60}s`;
  return `${Math.floor(n / 3600)}h ${Math.floor(n % 3600 / 60)}m`;
}
function schedule() {
  clearTimeout(timer);
  if (automatic && !document.hidden) timer = setTimeout(refresh, 3000);
}
async function refresh() {
  if (pending) return;
  clearTimeout(timer);
  pending = true;
  $('request').disabled = true;
  const start = performance.now();
  try {
    const response = await fetch('/api/runtime', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    const elapsed = performance.now() - start;
    responses++;
    const identity = `${data.revision}/${data.replica}`;
    const changed = previousIdentity !== undefined && previousIdentity !== identity;
    previousIdentity = identity;
    document.querySelector('.identity').classList.toggle('changed', changed);
    set('replica-event', changed ? '↗ INSTANCE CHANGED' : '');
    const nextAccent = /^#[0-9a-f]{6}$/i.test(data.accent) ? data.accent : '#F4D64C';
    const accentChanged = accent !== nextAccent;
    accent = nextAccent;
    document.documentElement.style.setProperty('--accent', accent);
    if (paused && accentChanged) draw();
    set('app-name', data.app);
    set('revision', data.revision);
    set('replica', data.replica);
    set('message', data.message);
    set('platform', data.platform);
    set('version', `v${data.version}`);
    set('uptime', uptime(data.processUptimeSeconds));
    set('memory', bytes(data.processRssBytes));
    set('architecture', `${data.os} / ${data.architecture}`);
    set('runtime-short', `Node.js ${data.runtime}`);
    set('runtime', `Node.js ${data.runtime}`);
    set('latency', `${Math.round(elapsed)} ms`);
    set('container-memory', bytes(data.containerMemoryUsageBytes));
    set('memory-limit', data.containerMemoryLimitBytes === null ? 'No finite limit / unavailable' : bytes(data.containerMemoryLimitBytes));
    set('commit', data.commit || 'Not provided at build time');
    set('timestamp', data.timestamp);
    set('request-count', String(responses));
    set('status', 'LIVE');
    $('status').classList.remove('offline');
    document.body.classList.remove('stale');
    $('error').hidden = true;
    pulse = 1;
  } catch {
    set('status', 'OFFLINE');
    $('status').classList.add('offline');
    document.body.classList.add('stale');
    set('error', 'No response from the app. Values shown are from the last successful request, not live data. Try again in a moment.');
    $('error').hidden = false;
  } finally {
    pending = false;
    $('request').disabled = false;
    schedule();
  }
}
$('request').addEventListener('click', refresh);
$('auto').addEventListener('click', () => {
  automatic = !automatic;
  $('auto').setAttribute('aria-pressed', String(automatic));
  set('auto', `Auto-refresh: ${automatic ? 'on' : 'off'}`);
  set('refresh-note', automatic ? 'Live data · every 3 seconds' : 'Manual refresh · send a request to update');
  if (automatic) refresh(); else clearTimeout(timer);
});

// Abstract generative illustration. Nodes are not replicas; no topology is implied.
const canvas = $('network');
const ctx = canvas.getContext('2d');
let width = 0, height = 0, centerX = 0, centerY = 0, scale = 100;
let raf = null, lastFrame = 0, time = 0;
function resize() {
  width = innerWidth; height = innerHeight;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const pixelWidth = Math.floor(width * dpr), pixelHeight = Math.floor(height * dpr);
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const hero = document.querySelector('.intro').getBoundingClientRect();
  centerX = hero.left + hero.width * (width < 600 ? .88 : .79);
  centerY = hero.top + hero.height * (width < 600 ? .65 : .44);
  scale = width < 600 ? 55 : Math.min(118, hero.width * .105);
  draw();
}
function line(points, color, lineWidth = 1) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = lineWidth;
  points.forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
  ctx.stroke();
}
function project([x,y,z], size, angle) {
  const a = x * Math.cos(angle) - z * Math.sin(angle);
  const b = x * Math.sin(angle) + z * Math.cos(angle);
  const tilt = .40;
  const py = y * Math.cos(tilt) - b * Math.sin(tilt);
  const pz = y * Math.sin(tilt) + b * Math.cos(tilt);
  const perspective = 4.5 / (4.5 + pz);
  return [centerX + a * size * perspective, centerY + py * size * perspective];
}
function draw() {
  ctx.clearRect(0, 0, width, height);
  const mobile = width < 600;
  // Broad, slow network field. Keep the text area intentionally quiet.
  for (let i = 0; i < 34; i++) {
    const x = (i * 173.7 + 61) % width;
    const y = (i * 109.3 + 30) % height;
    const dx = Math.sin(time * .20 + i) * 14;
    const dy = Math.cos(time * .13 + i) * 11;
    const opacity = x < width * .6 ? .035 : .11;
    ctx.fillStyle = `rgba(255,255,255,${opacity})`;
    ctx.beginPath(); ctx.arc(x+dx,y+dy,1.5,0,Math.PI*2); ctx.fill();
    if (i % 3 === 0) line([[x+dx,y+dy],[x+dx+70,y+dy-40],[x+dx+115,y+dy-40]], `rgba(255,255,255,${opacity*.6})`);
  }
  ctx.save();
  ctx.globalAlpha = mobile ? .18 : 1;
  // Elliptical orbital tracks with travelling light points.
  for (let ring = 0; ring < 3; ring++) {
    const radius = scale * (1.65 + ring * .35);
    const rotation = -.3 + ring * .85;
    const points = [];
    for (let i=0; i<=100; i++) {
      const theta = i / 100 * Math.PI * 2;
      const x = Math.cos(theta)*radius, y=Math.sin(theta)*radius*.40;
      points.push([centerX+x*Math.cos(rotation)-y*Math.sin(rotation), centerY+x*Math.sin(rotation)+y*Math.cos(rotation)]);
    }
    line(points, '#ffffff1d');
    const theta = time*(.18+ring*.08)+ring*2.1;
    const x=Math.cos(theta)*radius,y=Math.sin(theta)*radius*.40;
    const px=centerX+x*Math.cos(rotation)-y*Math.sin(rotation), py=centerY+x*Math.sin(rotation)+y*Math.cos(rotation);
    ctx.fillStyle = accent; ctx.shadowColor=accent; ctx.shadowBlur=12;
    ctx.beginPath(); ctx.arc(px,py,2.8,0,Math.PI*2); ctx.fill(); ctx.shadowBlur=0;
  }
  const vertices = [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]];
  const edges = [[0,1],[1,2],[2,3],[3,0],[4,5],[5,6],[6,7],[7,4],[0,4],[1,5],[2,6],[3,7]];
  const angle = .55 + time*.13;
  for (const [factor, color] of [[1,accent+'b8'], [.76,accent+'35']]) {
    const points = vertices.map(v => project(v,scale*.68*factor,angle));
    for (const [a,b] of edges) line([points[a],points[b]],color,factor===1?1.5:1);
    if (factor === 1) for (const [x,y] of points) {ctx.fillStyle=accent;ctx.beginPath();ctx.arc(x,y,2.4,0,Math.PI*2);ctx.fill();}
  }
  // A genuine successful HTTP response triggers this outward ring.
  if (pulse > .015 && !paused) {
    ctx.strokeStyle=accent;ctx.globalAlpha*=pulse*.5;ctx.lineWidth=1;
    ctx.beginPath();ctx.ellipse(centerX,centerY,scale*(1.3+(1-pulse)*1.8),scale*(.65+(1-pulse)*.9),-.3,0,Math.PI*2);ctx.stroke();
  }
  ctx.restore();
}
function frame(timestamp) {
  if (paused || document.hidden) { raf = null; return; }
  const delta = timestamp - lastFrame;
  if (delta >= 1000/30) {
    time += Math.min(delta, 70)/1000;
    pulse *= .96;
    lastFrame = timestamp;
    draw();
  }
  raf = requestAnimationFrame(frame);
}
function syncMotion() {
  if (raf !== null) cancelAnimationFrame(raf);
  raf = null;
  set('motion', paused ? 'Resume motion' : 'Pause motion');
  $('motion').setAttribute('aria-pressed', String(paused));
  if (!paused && !document.hidden) { lastFrame = performance.now(); raf = requestAnimationFrame(frame); }
}
$('motion').addEventListener('click', () => { paused = !paused; syncMotion(); });
motionPreference.addEventListener('change', event => { paused = event.matches; syncMotion(); });
document.addEventListener('visibilitychange', () => {
  syncMotion();
  if (document.hidden) clearTimeout(timer);
  else if (automatic) refresh();
});
addEventListener('resize', resize);
addEventListener('scroll', resize, { passive: true });
resize(); syncMotion(); refresh();
