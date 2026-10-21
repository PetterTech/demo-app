import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

function cgroupValue(paths) {
  for (const path of paths) {
    try {
      const raw = readFileSync(path, 'utf8').trim();
      const value = Number(raw);
      if (raw === 'max' || value >= 2 ** 60) return null;
      if (Number.isFinite(value) && value >= 0) return value;
    } catch { /* Not available on this platform: never substitute host RAM. */ }
  }
  return null;
}

function unescapeMountPath(value) {
  return value.replace(/\\([0-7]{3})/g, (_, octal) => String.fromCharCode(Number.parseInt(octal, 8)));
}

function memoryCgroupPaths(procCgroupPath, procMountInfoPath) {
  try {
    const memberships = readFileSync(procCgroupPath, 'utf8').trim().split('\n').map(line => {
      const [hierarchy, controllers, group] = line.split(':');
      return { hierarchy, controllers: controllers.split(','), group };
    });
    const mounts = readFileSync(procMountInfoPath, 'utf8').trim().split('\n').flatMap(line => {
      const separator = line.indexOf(' - ');
      if (separator < 0) return [];
      const mount = line.slice(0, separator).split(' ');
      const filesystem = line.slice(separator + 3).split(' ');
      if (mount.length < 6 || filesystem.length < 3) return [];
      const options = new Set(`${mount[5]},${filesystem[2]}`.split(','));
      return [{
        root: path.posix.normalize(unescapeMountPath(mount[3])),
        point: path.posix.normalize(unescapeMountPath(mount[4])),
        type: filesystem[0],
        options,
      }];
    });
    const paths = { v2: [], v1: [] };
    for (const membership of memberships) {
      const type = membership.hierarchy === '0' && membership.controllers.length === 1 && membership.controllers[0] === ''
        ? 'v2'
        : membership.controllers.includes('memory') ? 'v1' : null;
      if (!type || !membership.group.startsWith('/')) continue;
      for (const mount of mounts) {
        if ((type === 'v2' && mount.type !== 'cgroup2')
          || (type === 'v1' && (mount.type !== 'cgroup' || !mount.options.has('memory')))) continue;
        const relative = path.posix.relative(mount.root, path.posix.normalize(membership.group));
        if (relative === '..' || relative.startsWith('../') || path.posix.isAbsolute(relative)) continue;
        paths[type].push(path.posix.join(mount.point, relative));
      }
    }
    return paths;
  } catch {
    return { v2: [], v1: [] };
  }
}

function containerMemory(procCgroupPath, procMountInfoPath) {
  const paths = memoryCgroupPaths(procCgroupPath, procMountInfoPath);
  return {
    limit: cgroupValue([
      ...paths.v2.map(directory => path.posix.join(directory, 'memory.max')),
      ...paths.v1.map(directory => path.posix.join(directory, 'memory.limit_in_bytes')),
    ]),
    usage: cgroupValue([
      ...paths.v2.map(directory => path.posix.join(directory, 'memory.current')),
      ...paths.v1.map(directory => path.posix.join(directory, 'memory.usage_in_bytes')),
    ]),
  };
}

export function createApp({
  env = process.env,
  procCgroupPath = '/proc/self/cgroup',
  procMountInfoPath = '/proc/self/mountinfo',
} = {}) {
  const files = new Map([
    ['/', ['index.html', 'text/html; charset=utf-8']],
    ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
    ['/style.css', ['style.css', 'text/css; charset=utf-8']],
    ['/logo.png', ['logo.png', 'image/png']],
    ['/favicon.png', ['favicon.png', 'image/png']],
    ['/montserrat-semibold.ttf', ['montserrat-semibold.ttf', 'font/ttf']],
    ['/montserrat-extrabold.ttf', ['montserrat-extrabold.ttf', 'font/ttf']],
  ].map(([route, [file, type]]) => [route, { body: readFileSync(new URL(`./public/${file}`, import.meta.url)), type }]));
  const headers = {
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  return http.createServer({ requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 8192 }, (req, res) => {
    function send(status, type, body, extra = {}) {
      res.writeHead(status, { ...headers, 'Content-Type': type, 'Cache-Control': 'no-store', ...extra });
      res.end(req.method === 'HEAD' ? undefined : body);
    }
    if (!['GET', 'HEAD'].includes(req.method)) {
      send(405, 'text/plain', 'Method not allowed', { Allow: 'GET, HEAD' }); return;
    }
    const route = req.url?.split('?')[0];
    if (route === '/healthz') { send(200, 'application/json', '{"status":"ok"}'); return; }
    const asset = files.get(route);
    if (asset) { send(200, asset.type, asset.body); return; }
    if (route !== '/api/runtime') { send(404, 'text/plain', 'Not found'); return; }
    const memory = containerMemory(procCgroupPath, procMountInfoPath);
    const publicText = (key, fallback) => String(env[key] || fallback).slice(0, 256);
    const data = {
      app: publicText('CONTAINER_APP_NAME', 'pettertech-demo'),
      revision: publicText('CONTAINER_APP_REVISION', 'Not provided'),
      replica: publicText('CONTAINER_APP_REPLICA_NAME', os.hostname()),
      platform: env.CONTAINER_APP_NAME ? 'Azure Container Apps' : 'Standalone container / process',
      runtime: process.version,
      os: process.platform,
      architecture: process.arch,
      timestamp: new Date().toISOString(),
      accent: /^#[0-9a-f]{6}$/i.test(env.DEMO_ACCENT || '') ? env.DEMO_ACCENT : '#F4D64C',
      version: publicText('DEMO_VERSION', '1.0.0'),
      commit: env.BUILD_COMMIT ? publicText('BUILD_COMMIT', '') : null,
      containerMemoryLimitBytes: memory.limit,
      containerMemoryUsageBytes: memory.usage,
      processRssBytes: process.memoryUsage().rss,
      processUptimeSeconds: process.uptime(),
      message: publicText('DEMO_MESSAGE', 'Less clicking. More creating.'),
    };
    send(200, 'application/json', JSON.stringify(data));
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const server = createApp();
  server.listen(Number(process.env.PORT || 8080), '0.0.0.0', () => console.log('PetterTech demo ready'));
}
