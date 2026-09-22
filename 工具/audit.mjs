// 审计单文件是否真的自包含：外部引用、编码、离线可用性
import fs from 'node:fs';
const BASE = 'D:/AI/DS harness/book-yiriweijian';
const s = fs.readFileSync(BASE + '/导读.html', 'utf8');

const srcs = [...s.matchAll(/\ssrc="([^"]*)"/g)].map((m) => m[1]);
const hrefs = [...s.matchAll(/\shref="([^"]*)"/g)].map((m) => m[1]);
const urls = [...s.matchAll(/url\(([^)]*)\)/g)].map((m) => m[1]);

const extern = (v) => !(v.startsWith('data:') || v.startsWith('#') || v === '');
const extSrc = srcs.filter(extern);
const extHref = hrefs.filter(extern);
const extUrl = urls.filter((v) => extern(v.replace(/['"]/g, '')));

console.log('src 属性:', srcs.length, '| 非 data:/# :', extSrc.length, extSrc.slice(0, 5));
console.log('href 属性:', hrefs.length, '| 非 #/data: :', extHref.length, extHref.slice(0, 5));
console.log('CSS url():', urls.length, '| 外部:', extUrl.length, extUrl.slice(0, 5));
console.log('charset 声明:', /<meta charset="utf-8">/i.test(s) ? 'utf-8 ✓' : '缺失 ✗');
console.log('http(s) 链接出现次数:', (s.match(/https?:\/\//g) || []).length, '（应为纯文本，非资源引用）');
console.log('含 <script>:', /<script>/.test(s), '| 含 <details>:', (s.match(/<details/g) || []).length);
console.log('viewport 声明:', /name="viewport"/.test(s) ? '✓' : '✗');
console.log('总字符:', s.length, '| UTF-8 字节:', Buffer.byteLength(s, 'utf8'));
console.log('data:image 数量:', (s.match(/data:image\//g) || []).length);
