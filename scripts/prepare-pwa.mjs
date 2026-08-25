import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const index = readFileSync('dist/index.html', 'utf8');
const assets = [...index.matchAll(/(?:src|href)="(\.\/assets\/[^\"]+)"/g)].map((match) => match[1]);
if (assets.length === 0) throw new Error('未找到 PWA 需要预缓存的构建资源。');

const core = [...new Set(['./', './data/tasks.json', './manifest.webmanifest', './apple-touch-icon.png', ...assets])];
const version = createHash('sha256').update(core.join('|')).digest('hex').slice(0, 12);
const worker = `const CACHE_NAME = 'jlpt-n2-dashboard-${version}';
const CORE = ${JSON.stringify(core)};

self.addEventListener('install', (event) => event.waitUntil(
  caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE)).then(() => self.skipWaiting()),
));
self.addEventListener('activate', (event) => event.waitUntil(
  caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()),
));
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || url.pathname.toLowerCase().endsWith('.pdf')) return;
  event.respondWith(caches.match(event.request).then((cached) => {
    const network = fetch(event.request).then((response) => {
      if (response.ok && response.type === 'basic') caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response.clone()));
      return response;
    }).catch(() => cached || caches.match('./'));
    return cached || network;
  }));
});
`;

writeFileSync('dist/sw.js', worker, 'utf8');
console.log(`已生成 PWA 离线缓存清单：${core.length} 项资源。`);
