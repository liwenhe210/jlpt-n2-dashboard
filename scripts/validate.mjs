import { readFileSync, statSync } from 'node:fs';

const baseline = JSON.parse(readFileSync('public/data/tasks.json', 'utf8'));
const ids = baseline.tasks.map((task) => task.id);
if (ids.length !== 142 || new Set(ids).size !== ids.length) throw new Error('任务基线数量或 ID 校验失败。');
if (baseline.tasks.some((task) => !Array.isArray(task.prerequisite) || !task.title || (!task.source_page && task.id !== 'JLPT-001'))) throw new Error('任务基线字段校验失败。');
for (const file of ['dist/index.html', 'dist/data/tasks.json', 'dist/manifest.webmanifest', 'dist/sw.js', 'dist/apple-touch-icon.png', 'dist/server/index.js']) statSync(file);
const html = readFileSync('dist/index.html', 'utf8');
if (!html.includes('assets/')) throw new Error('构建资源未使用相对路径。');
console.log('验证通过：142 项只读任务基线与 PWA 静态产物齐全。');
