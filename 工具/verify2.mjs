// 校验最终单文件成品：断链、折叠结构、锚点、体积
import fs from 'node:fs';
const BASE = 'D:/AI/DS harness/book-yiriweijian';
const s = fs.readFileSync(BASE + '/导读.html', 'utf8');
const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = [...s.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const miss = [...new Set(hrefs.filter((h) => !ids.has(h)))];
const details = (s.match(/<details/g) || []).length;
console.log('大小(MB):', (s.length / 1048576).toFixed(2));
console.log('id 数:', ids.size, '| 内部链接:', hrefs.length, '| 断链:', miss.length, miss.slice(0, 8));
console.log('折叠块:', details, '（章级', (s.match(/details class="chap"/g) || []).length, '/ 篇级小结', (s.match(/details class="extra"/g) || []).length, '）');
console.log('原文段落锚点:', [...ids].filter((i) => i.startsWith('p-')).length);
console.log('章节速览块:', (s.match(/本 章 速 览/g) || []).length);
console.log('▶原文 徽标:', (s.match(/class="jump"/g) || []).length);
console.log('封面:', s.includes('class="cover"'), '| 工具条:', s.includes('data-act="expand"'));
console.log('内嵌图片:', (s.match(/<img /g) || []).length);
console.log('导读可见区字数(约):', s.slice(s.indexOf('id="guide"'), s.indexOf('class="toolbar"')).replace(/<[^>]+>/g, '').replace(/\s+/g, '').length);
