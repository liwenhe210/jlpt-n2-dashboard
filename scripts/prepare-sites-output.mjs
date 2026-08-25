import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('dist/server', { recursive: true });
writeFileSync(
  'dist/server/index.js',
  "export default { async fetch(request, env) { return env.ASSETS.fetch(request); } };\\n",
);
