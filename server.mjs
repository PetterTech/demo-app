import http from 'node:http';
import os from 'node:os';
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

export function createApp({ env = process.env } = {}) {
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
      containerMemoryLimitBytes: cgroupValue(['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']),
      containerMemoryUsageBytes: cgroupValue(['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes']),
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
