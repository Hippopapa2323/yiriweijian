// 校验：所有内部链接目标存在；段落/锚点数量一致
import fs from 'node:fs';
const BASE = 'D:/AI/DS harness/book-yiriweijian';
const src = fs.readFileSync(BASE + '/原文.html', 'utf8');
const ids = new Set([...src.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = [...src.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const missing = [...new Set(hrefs.filter((h) => !ids.has(h)))];
console.log('id 总数:', ids.size);
console.log('内部链接数:', hrefs.length, '去重:', new Set(hrefs).size);
console.log('断链数:', missing.length);
if (missing.length) console.log(missing.slice(0, 20));
const anchors = JSON.parse(fs.readFileSync(BASE + '/anchors.json', 'utf8'));
const lack = Object.keys(anchors).filter((a) => !ids.has(a));
console.log('anchors.json 条目:', Object.keys(anchors).length, '| 未出现在 HTML 中:', lack.length, lack.slice(0, 10));
console.log('段落 id 数:', [...ids].filter((i) => i.startsWith('p-')).length);
console.log('小节 id 数:', [...ids].filter((i) => i.startsWith('s-')).length);
console.log('脚注 id 数:', [...ids].filter((i) => i.startsWith('fn-')).length);
