// 把 导读.md 渲染成 HTML，并与自包含的原文阅读版合并为单一文件 导读.html
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'D:/AI/DS harness/book-yiriweijian';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const inline = (s) =>
  esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a class="jump" href="$2">$1</a>');

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  const flushP = (buf) => {
    if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`);
    buf.length = 0;
  };
  const buf = [];
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*$/.test(ln)) { flushP(buf); i++; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) {
      flushP(buf);
      const lv = Math.min(6, m[1].length + 1);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`);
      i++; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      flushP(buf);
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]);
      const body = rows.slice(1).filter((r) => !/^\s*\|[\s:|-]+\|\s*$/.test(r)).map(cells);
      out.push('<div class="tablewrap"><table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>' +
        body.map((r) => '<tr>' + r.map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>').join('') + '</tbody></table></div>');
      continue;
    }
    if (/^\s*>\s?/.test(ln)) {
      flushP(buf);
      const q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      flushP(buf);
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>');
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(ln)) {
      flushP(buf);
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>');
      continue;
    }
    if (/^\s*---+\s*$/.test(ln)) { flushP(buf); out.push('<hr>'); i++; continue; }
    buf.push(ln.trim());
    i++;
  }
  flushP(buf);
  return out.join('\n');
}

const guideCss = `
#guide{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:8px 30px 30px;margin:0 0 26px}
#guide h2{font-size:21px;margin:30px 0 12px;padding-bottom:10px;border-bottom:2px solid #efece7}
#guide h3{font-size:17px;margin:22px 0 8px;color:#7a4a1e}
#guide h4{font-size:15px;margin:16px 0 6px}
#guide p{margin:0 0 12px;text-indent:0}
#guide ul,#guide ol{margin:0 0 14px;padding-left:24px}
#guide li{margin:5px 0}
#guide blockquote{margin:12px 0;padding:10px 16px;background:#faf8f4;border-left:3px solid #ddd3c4;color:#4a4a4e;font-size:15px}
#guide hr{border:0;border-top:1px dashed var(--bd);margin:28px 0}
#guide a.jump{display:inline-block;font-size:12px;color:#8a5a2b;background:#f6efe4;border:1px solid #e6dac6;border-radius:4px;padding:0 5px;margin-left:2px;text-decoration:none;vertical-align:1px;line-height:1.5}
#guide a.jump:hover{background:#ecdfc9}
#guide .tablewrap{overflow-x:auto;margin:14px 0}
#guide table{border-collapse:collapse;width:100%;font-size:14px}
#guide th,#guide td{border:1px solid var(--bd);padding:7px 10px;text-align:left;vertical-align:top}
#guide th{background:#f4f1ec}
.backguide{text-align:right;text-indent:0;font-size:13px;margin:-8px 0 14px}
.backguide a{color:var(--muted)}
.guidejump{position:fixed;left:18px;bottom:18px;background:#fff;border:1px solid var(--bd);border-radius:20px;padding:8px 14px;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
`;

// 按文件名顺序拼装 导读-parts/*.md（去掉 BOM），生成 导读.md
const partsDir = path.join(BASE, '导读-parts');
const partFiles = fs.readdirSync(partsDir).filter((f) => f.endsWith('.md')).sort();
const md = partFiles
  .map((f) => fs.readFileSync(path.join(partsDir, f), 'utf8').replace(/^\uFEFF/, '').trim())
  .join('\n\n');
fs.writeFileSync(path.join(BASE, '导读.md'), md, 'utf8');
console.log('已拼装 导读.md，来自:', partFiles.join(', '));
const guideHtml = mdToHtml(md);

let src = fs.readFileSync(path.join(BASE, '原文.html'), 'utf8');
src = src.replace('<title>以日为鉴：衰退时代生存指南 — 原文（逐字保留）</title>',
  '<title>以日为鉴：衰退时代生存指南 — 导读 + 原文（逐字保留，可跳转）</title>');
src = src.replace('</style>', guideCss + '</style>');
src = src.replace('<div class="wrap">', () => '<div class="wrap">\n<section id="guide">\n' + guideHtml + '\n</section>');
src = src.replace(/<section id="ch-([^"]+)">/g, (all, k) => `<section id="ch-${k}">\n<p class="backguide"><a href="#guide">↑ 返回导读</a></p>`);
src = src.replace('<a class="backtop" href="#toc">目录</a>', '<a class="guidejump" href="#guide">↑ 导读</a>\n<a class="backtop" href="#toc">目录</a>');
fs.writeFileSync(path.join(BASE, '导读.html'), src, 'utf8');
console.log('导读.html 大小(MB):', (fs.statSync(path.join(BASE, '导读.html')).size / 1048576).toFixed(2));
console.log('导读 HTML 段落数:', (guideHtml.match(/<p>|<li>/g) || []).length);
