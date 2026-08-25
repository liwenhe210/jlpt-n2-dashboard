import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
const size = 180; const rows = [];
for (let y = 0; y < size; y += 1) { const row = Buffer.alloc(1 + size * 4); for (let x = 0; x < size; x += 1) { const i = 1 + x * 4; const inside = x > 18 && x < 162 && y > 18 && y < 162; const mark = x > 61 && x < 119 && y > 55 && y < 125; row[i] = mark ? 241 : inside ? 53 : 246; row[i + 1] = mark ? 244 : inside ? 95 : 246; row[i + 2] = mark ? 238 : inside ? 86 : 242; row[i + 3] = 255; } rows.push(row); }
const crc32 = (data) => { let crc = 0xffffffff; for (const value of data) { crc ^= value; for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ 0xffffffff) >>> 0; };
const chunk = (type, data) => { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, checksum]); };
const png = Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR', Buffer.from([0,0,0,180,0,0,0,180,8,6,0,0,0])),chunk('IDAT', deflateSync(Buffer.concat(rows))),chunk('IEND',Buffer.alloc(0))]);
mkdirSync('public',{recursive:true}); writeFileSync('public/apple-touch-icon.png',png);
