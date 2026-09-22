// 校验最终 导读.html 的内部跳转
import fs from 'node:fs';
const s = fs.readFileSync('D:/AI/DS harness/book-yiriweijian/导读.html', 'utf8');
const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const hrefs = [...s.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
const miss = [...new Set(hrefs.filter((h) => !ids.has(h)))];
console.log('文件大小(MB):', (s.length / 1048576).toFixed(2));
console.log('id 数:', ids.size, '| 内部链接:', hrefs.length, '| 断链:', miss.length, miss.slice(0, 10));
console.log('含导读区:', s.includes('id="guide"'));
console.log('返回导读链接:', (s.match(/class="backguide"/g) || []).length);
console.log('原文段落锚点:', [...ids].filter((i) => i.startsWith('p-')).length);
console.log('▶原文 徽标:', (s.match(/class="jump"/g) || []).length);
