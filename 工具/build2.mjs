// 生成最终单文件成品：顶部凝练导读 + 按章折叠的逐字原文（▶原文 自动展开定位）
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'D:/AI/DS harness/book-yiriweijian';
const RAW = path.join(BASE, 'raw');
const OUT_HTML = path.join(BASE, '导读.html');
const OUT_MD = path.join(BASE, '导读.md');

/* ---------------- EPUB 解析 ---------------- */
const opf = fs.readFileSync(path.join(RAW, 'content.opf'), 'utf8');
const manifest = new Map();
for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/g)) {
  const a = m[1];
  const id = /\bid="([^"]+)"/.exec(a)?.[1];
  const href = /\bhref="([^"]+)"/.exec(a)?.[1];
  if (id && href) manifest.set(id, href);
}
const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/g)].map((m) => m[1]);

const ent = (s) => s
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
const strip = (h) => ent(String(h).replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).replace(/[ \t\u00a0]+/g, ' ').trim();
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const uriCache = new Map();
function dataUri(src) {
  const p = path.resolve(path.join(RAW, 'EPUB/xhtml'), src);
  if (uriCache.has(p)) return uriCache.get(p);
  let u = '';
  try {
    const buf = fs.readFileSync(p);
    const ext = path.extname(p).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
    u = `data:${mime};base64,${buf.toString('base64')}`;
  } catch { u = ''; }
  uriCache.set(p, u);
  return u;
}

const TOKEN = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<aside\b([^>]*)>([\s\S]*?)<\/aside>|<img\b([^>]*?)\/?>/g;
const secHeadRe = /^[（(]?[一二三四五六七八九十百]+[）)、.]\s*\S/;

const parsed = [];
let coverImg = null;
for (const id of spine) {
  const href = manifest.get(id);
  if (!href) continue;
  const src = fs.readFileSync(path.join(RAW, href), 'utf8');
  const key = id.replace(/\.xhtml$/, '');
  const title = strip(/<title>([\s\S]*?)<\/title>/.exec(src)?.[1] ?? key);
  const body = /<body[^>]*>([\s\S]*?)<\/body>/.exec(src)?.[1] ?? '';
  const blocks = [];
  let pn = 0, hn = 0, sn = 0;
  for (const m of body.matchAll(TOKEN)) {
    if (m[1]) {
      const lvl = Math.min(3, Math.max(1, +m[1]));
      const text = strip(m[2]);
      if (!text) continue;
      const aid = `h-${key}-${++hn}`;
      blocks.push({ kind: 'h', aid, text, html: `<h${lvl + 1} id="${aid}">${m[2].trim()}</h${lvl + 1}>` });
    } else if (m[3] !== undefined) {
      let html = m[3];
      const text0 = strip(html);
      if (!text0) continue;
      const isSec = text0.length <= 40 && secHeadRe.test(text0) && /calibre19|calibre22/.test(html);
      const aid = isSec ? `s-${key}-${++sn}` : `p-${key}-${++pn}`;
      html = html.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/g, (all, inner) => {
        const h = /href="#([^"]+)"/.exec(inner)?.[1];
        return h ? `<sup class="fnref"><a href="#fn-${h}" title="查看脚注">[注]</a></sup>` : '';
      });
      html = html.replace(/<img\b([^>]*?)\/?>/g, (all2, a) => {
        const srcAttr = /src="([^"]+)"/.exec(a)?.[1];
        const alt = ent(/alt="([^"]*)"/.exec(a)?.[1] ?? '');
        const u = srcAttr ? dataUri(srcAttr) : '';
        return u ? `<figure><img src="${u}" alt="${esc(alt)}">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>` : '';
      });
      blocks.push(isSec
        ? { kind: 'sec', aid, text: text0, html: `<h4 class="sec" id="${aid}">${html}</h4>` }
        : { kind: 'p', aid, text: text0, html: `<p id="${aid}">${html}</p>` });
    } else if (m[4] !== undefined) {
      const fid = /id="([^"]+)"/.exec(m[4])?.[1] ?? `anon${blocks.length}`;
      const text = strip(m[5]);
      if (!text) continue;
      blocks.push({ kind: 'fn', aid: `fn-${fid}`, text, html: `<div class="footnote" id="fn-${fid}"><span class="fnlabel">脚注</span>${esc(text)}</div>` });
    } else if (m[6] !== undefined) {
      const srcAttr = /src="([^"]+)"/.exec(m[6])?.[1];
      const alt = ent(/alt="([^"]*)"/.exec(m[6])?.[1] ?? '');
      const u = srcAttr ? dataUri(srcAttr) : '';
      if (!u) continue;
      if ((key === 'cover' || key === 'titlepage') && !coverImg) { coverImg = u; continue; }
      blocks.push({ kind: 'img', aid: `img-${key}-${blocks.length}`, text: alt || '（图片）', html: `<figure id="img-${key}-${blocks.length}"><img src="${u}" alt="${esc(alt)}">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>` });
    }
  }
  const firstH = blocks.find((b) => b.kind === 'h');
  parsed.push({ key, title: firstH?.text || title, coverImg, blocks });
}
const byKey = new Map(parsed.map((c) => [c.key, c]));

/* ---------------- Markdown -> HTML ---------------- */
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a class="jump" href="$2">$1</a>');

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let i = 0;
  const buf = [];
  const flushP = () => { if (buf.length) out.push(`<p>${inline(buf.join(' '))}</p>`); buf.length = 0; };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^\s*$/.test(ln)) { flushP(); i++; continue; }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(ln))) {
      flushP();
      const lv = Math.min(6, m[1].length + 1);
      out.push(`<h${lv}>${inline(m[2])}</h${lv}>`); i++; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(ln)) {
      flushP();
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
      flushP();
      const q = [];
      while (i < lines.length && /^\s*>\s?/.test(lines[i])) { q.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
      out.push(`<blockquote>${inline(q.join(' '))}</blockquote>`); continue;
    }
    if (/^\s*[-*]\s+/.test(ln)) {
      flushP();
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, '')); i++; }
      out.push('<ul>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ul>'); continue;
    }
    if (/^\s*\d+[.)]\s+/.test(ln)) {
      flushP();
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, '')); i++; }
      out.push('<ol>' + items.map((t) => `<li>${inline(t)}</li>`).join('') + '</ol>'); continue;
    }
    if (/^\s*---+\s*$/.test(ln)) { flushP(); out.push('<hr>'); i++; continue; }
    buf.push(ln.trim()); i++;
  }
  flushP();
  return out.join('\n');
}

/* ---------------- 解析各篇详解 md ---------------- */
const partsDir = path.join(BASE, '导读-parts');
const partsMeta = [
  { file: '10-part1.md', partKey: 'chapter2', keys: ['chapter2_0001', 'chapter2_0002', 'chapter2_0003'] },
  { file: '20-part2.md', partKey: 'chapter3', keys: ['chapter3_0001', 'chapter3_0002', 'chapter3_0003'] },
  { file: '30-part3.md', partKey: 'chapter4', keys: ['chapter4_0001', 'chapter4_0002', 'chapter4_0003', 'chapter4_0004'] },
  { file: '40-part4.md', partKey: 'chapter5', keys: ['chapter5_0001', 'chapter5_0002', 'chapter5_0003'] },
  { file: '50-part5.md', partKey: 'chapter6', keys: ['chapter6_0001', 'chapter6_0002', 'chapter7', 'chapter8'] },
];

const chapterGuide = new Map();   // key -> { oneline, md }
const partGuide = new Map();      // partKey -> { title, intro, extras: [md] }

for (const meta of partsMeta) {
  const txt = fs.readFileSync(path.join(partsDir, meta.file), 'utf8').replace(/^\uFEFF/, '');
  const lines = txt.split(/\r?\n/);
  const part = { title: '', intro: [], extras: [] };
  const sections = [];
  let cur = null;
  for (const ln of lines) {
    if (/^##\s+/.test(ln)) { part.title = ln.replace(/^##\s+/, '').trim(); continue; }
    if (/^###\s+/.test(ln)) {
      if (cur) sections.push(cur);
      cur = { heading: ln.replace(/^###\s+/, '').trim(), lines: [] };
      continue;
    }
    if (cur) cur.lines.push(ln);
    else if (/^\s*>\s?/.test(ln)) part.intro.push(ln.replace(/^\s*>\s?/, '').trim());
  }
  if (cur) sections.push(cur);

  // 把「**这一篇…」这类篇级收尾从章正文里剥出来
  const chapterSecs = [];
  for (const s of sections) {
    const isChapter = /^(第[一二三四五六七八九十]+章|后记)/.test(s.heading);
    if (!isChapter) { part.extras.push(s); continue; }
    const idx = s.lines.findIndex((l) => /^\*\*这一篇/.test(l.trim()));
    if (idx >= 0) {
      part.extras.push({ heading: '本篇小结', lines: s.lines.slice(idx) });
      s.lines = s.lines.slice(0, idx);
    }
    chapterSecs.push(s);
  }

  let ki = 0;
  for (const s of chapterSecs) {
    const keys = /^后记/.test(s.heading) ? meta.keys.slice(ki) : [meta.keys[ki]];
    for (const k of keys) {
      const oneline = (/^\*\*一句话主旨\*\*[：:]\s*(.+)$/m.exec(s.lines.join('\n'))?.[1] ?? '').trim();
      const md = s.lines.join('\n').replace(/^\*\*一句话主旨\*\*[：:].*$/m, '').trim();
      chapterGuide.set(k, { oneline, md });
    }
    ki += keys.length;
  }
  partGuide.set(meta.partKey, part);
}

/* ---------------- 组装 HTML ---------------- */
const css = `
:root{--fg:#1c1c1e;--muted:#6b6b70;--bd:#e3e3e6;--hl:#fff3bf;--acc:#8a5a2b;--bg:#f6f5f2}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font-family:"PingFang SC","Microsoft YaHei","Hiragino Sans GB",system-ui,sans-serif;line-height:1.9;font-size:17px}
a{color:#1a5fb4;text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:860px;margin:0 auto;padding:0 20px 120px}
header.top{background:#fff;border-bottom:1px solid var(--bd);padding:22px 20px}
header.top .inner{max-width:860px;margin:0 auto;display:flex;gap:20px;align-items:center}
header.top img.cover{width:104px;border-radius:6px;box-shadow:0 4px 16px rgba(0,0,0,.18);flex:0 0 auto}
header.top h1{font-size:22px;margin:0 0 6px}
header.top .meta{color:var(--muted);font-size:13.5px;line-height:1.7}
#guide{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:6px 28px 24px;margin:24px 0}
#guide h2{font-size:17px;margin:26px 0 10px;padding-bottom:8px;border-bottom:2px solid #efece7}
#guide h3{font-size:16px;margin:20px 0 8px;color:#7a4a1e}
#guide p{margin:0 0 11px}
#guide ul,#guide ol{margin:0 0 12px;padding-left:24px}
#guide li{margin:6px 0}
#guide blockquote{margin:10px 0 16px;padding:10px 16px;background:#faf8f4;border-left:3px solid #ddd3c4;color:#4a4a4e;font-size:15px}
#guide a.jump{display:inline-block;font-size:12px;color:#8a5a2b;background:#f6efe4;border:1px solid #e6dac6;border-radius:4px;padding:0 6px;text-decoration:none;line-height:1.6}
#guide table{border-collapse:collapse;width:100%;font-size:14.5px}
#guide th,#guide td{border:1px solid var(--bd);padding:5px 9px;text-align:left;vertical-align:middle}
#guide th{background:#f4f1ec}
.toolbar{position:sticky;top:0;z-index:20;display:flex;gap:10px;align-items:center;flex-wrap:wrap;
  background:rgba(246,245,242,.94);backdrop-filter:blur(6px);border:1px solid var(--bd);border-radius:10px;padding:9px 14px;margin:0 0 18px;font-size:14px}
.toolbar button{font:inherit;font-size:14px;padding:5px 12px;border:1px solid #d8d2c8;background:#fff;border-radius:16px;cursor:pointer;color:#5a4a34}
.toolbar button:hover{background:#f6efe4}
.toolbar .tip{color:var(--muted);margin-left:auto;font-size:13px}
h2.part{font-size:20px;margin:34px 0 6px;padding:12px 0 6px;border-bottom:2px solid #d9d2c6;color:#6b4a22}
.partbanner{text-align:center}
.partbanner figure{margin:14px 0}
.partbanner img{max-width:100%;max-height:300px;width:auto;border-radius:6px}
p.partintro{color:#5a5a5e;font-size:14.5px;margin:0 0 14px;padding-left:14px;border-left:3px solid #e6dac6}
details{background:#fff;border:1px solid var(--bd);border-radius:10px;margin:0 0 12px}
details.chap>summary{cursor:pointer;padding:13px 18px;display:flex;gap:12px;align-items:baseline;list-style:none;border-radius:10px}
details.chap>summary::-webkit-details-marker{display:none}
details.chap>summary:before{content:"▸";color:#b9a88c;font-size:15px;flex:0 0 auto;transition:transform .15s}
details[open].chap>summary:before{transform:rotate(90deg)}
details.chap>summary:hover{background:#fbf9f5}
.ctitle{font-weight:700;flex:0 0 auto}
.coneline{color:var(--muted);font-size:13.5px;flex:1 1 auto;line-height:1.6}
.cmark{flex:0 0 auto;font-size:12px;color:#8a5a2b;background:#f6efe4;border:1px solid #e6dac6;border-radius:10px;padding:1px 9px}
details[open] .cmark{visibility:hidden}
.chapbody{padding:2px 22px 22px}
.quick{background:#fbf8f2;border:1px solid #efe7d9;border-radius:8px;padding:4px 18px 12px;margin:6px 0 18px;font-size:15.5px}
.quick .qhead{font-size:12px;letter-spacing:.14em;color:#a08a63;margin:12px 0 6px}
.quick ul,.quick ol{margin:0 0 10px;padding-left:22px}
.quick li{margin:5px 0}
.quick p{margin:0 0 9px}
.quick blockquote{margin:10px 0;padding:9px 14px;background:#fff;border-left:3px solid #e0d5c2;color:#4a4a4e;font-size:15px}
.quick a.jump{display:inline-block;font-size:12px;color:#8a5a2b;background:#f2e9da;border:1px solid #e2d5bf;border-radius:4px;padding:0 6px;text-decoration:none;line-height:1.6}
.quick table{border-collapse:collapse;width:100%;font-size:14px;background:#fff}
.quick th,.quick td{border:1px solid var(--bd);padding:5px 9px;text-align:left;vertical-align:top}
.quick th{background:#f6f2ea}
.quick .tablewrap{overflow-x:auto}
details.extra{margin-top:8px}
details.extra>summary{cursor:pointer;padding:11px 18px;font-weight:600;color:#6b4a22;list-style:none}
details.extra>summary::-webkit-details-marker{display:none}
details.extra>summary:before{content:"▸ ";color:#b9a88c}
details[open].extra>summary:before{content:"▾ "}
.orig{margin-top:6px}
.orig h2,.orig h3{font-size:18px;line-height:1.5;margin:6px 0 16px;padding-bottom:10px;border-bottom:2px solid #efece7}
.orig h3{font-size:17px}
.orig h4.sec{font-size:16.5px;margin:26px 0 10px;color:var(--acc)}
.orig p{margin:0 0 15px;text-indent:2em}
.orig figure{margin:20px 0;text-align:center}
.orig figure img{max-width:100%;border-radius:6px}
.orig figcaption{color:var(--muted);font-size:13px;margin-top:6px}
.footnote{background:#faf8f4;border-left:3px solid #ddd3c4;padding:8px 12px;margin:0 0 15px;font-size:14px;line-height:1.75;color:#4a4a4e}
.fnlabel{display:inline-block;background:#e8e2d6;color:#6b5a3e;border-radius:3px;padding:0 6px;margin-right:8px;font-size:12px}
sup.fnref a{font-size:12px;padding:0 2px}
[id]{scroll-margin-top:76px}
.flash{background:var(--hl)!important;box-shadow:0 0 0 6px var(--hl);border-radius:3px}
.gotoguide{position:fixed;right:18px;bottom:18px;background:#fff;border:1px solid var(--bd);border-radius:20px;padding:8px 14px;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.08);z-index:30}
.tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch}
#guide .tablewrap{overflow-x:auto}
body{overflow-wrap:break-word}
@media(max-width:640px){
  body{font-size:16px;line-height:1.85}
  .wrap{padding:0 12px 90px}
  header.top{padding:16px 12px}
  header.top img.cover{display:none}
  header.top h1{font-size:19px}
  .coneline{display:none}
  #guide{padding:2px 15px 18px;border-radius:8px;margin:14px 0}
  #guide table{font-size:13.5px}
  #guide th,#guide td{padding:4px 7px}
  .toolbar{font-size:13px;padding:7px 10px;gap:7px}
  .toolbar .tip{display:none}
  h2.part{font-size:18px;margin:26px 0 6px}
  p.partintro{font-size:14px}
  .partbanner img{max-height:190px}
  details.chap>summary{padding:11px 12px;gap:8px}
  .ctitle{font-size:15.5px}
  .chapbody{padding:2px 13px 16px}
  .quick{padding:2px 13px 10px;font-size:15px}
  .quick table{font-size:13px}
  .orig h2,.orig h3{font-size:17px}
  .orig p{text-indent:1.6em}
  .gotoguide{right:10px;bottom:10px;padding:7px 12px;font-size:13px}
}
`;

const cover = coverImg || '';
const partKeys = new Set(partsMeta.map((p) => p.partKey));
const skip = new Set(['titlepage', 'cover']);

const oneLiners = {
  bq: '版权信息',
  chapter1: '作者立场：不写宏大叙事，只追问政策对具体的人和职业做了什么',
  chapter9: '全部统计数据的出处清单（e-Stat 与各省白皮书）',
  chapter10: '参考文献',
};
const badges = { chapter1: '前言', chapter7: '后记', chapter8: '结语', chapter9: '数据', chapter10: '文献', bq: '版权' };

const html = [];
let pendingExtras = [];   // 篇级小结：排在本篇各章之后、下一篇标题之前
for (const ch of parsed) {
  if (skip.has(ch.key)) continue;
  if (partKeys.has(ch.key)) {
    if (pendingExtras.length) { html.push(pendingExtras.join('\n')); pendingExtras = []; }
    const g = partGuide.get(ch.key) || { title: ch.title, intro: [], extras: [] };
    html.push(`<h2 class="part" id="ch-${ch.key}">${esc(ch.title)}</h2>`);
    const partBlocks = ch.blocks.filter((b) => b.kind !== 'h').map((b) => b.html).join('\n');
    if (partBlocks) html.push(`<div class="partbanner">${partBlocks}</div>`);
    if (g.intro?.length) html.push(`<p class="partintro">${inline(g.intro.join(' '))}</p>`);
    pendingExtras = (g.extras || []).map((ex) => `<details class="extra"><summary>${esc(ex.heading)}</summary><div class="chapbody">${mdToHtml(ex.lines.join('\n'))}</div></details>`);
    continue;
  }
  const g = chapterGuide.get(ch.key);
  const oneline = g?.oneline || oneLiners[ch.key] || '';
  const body = ch.blocks.map((b, i) => (b.kind === 'h' && i === ch.blocks.findIndex((x) => x.kind === 'h') ? '' : b.html)).join('\n');
  html.push(`<details class="chap" id="ch-${ch.key}">
<summary><span class="ctitle">${esc(ch.title)}</span>${oneline ? `<span class="coneline">${esc(oneline)}</span>` : ''}<span class="cmark">展开</span></summary>
<div class="chapbody">
${g ? `<div class="quick"><p class="qhead">本 章 速 览</p>${mdToHtml(g.md.replace(/^###\s+.*$/m, '').trim())}</div>` : ''}
<div class="orig">${body}</div>
</div>
</details>`);
}

if (pendingExtras.length) html.push(pendingExtras.join('\n'));

const guideHtml = mdToHtml(fs.readFileSync(path.join(BASE, '导读-顶部.md'), 'utf8').replace(/^\uFEFF/, ''));

const js = `
(function(){
  function openAncestors(el){
    var p = el;
    while(p && p !== document.body){
      if(p.tagName === 'DETAILS') p.open = true;
      p = p.parentElement;
    }
  }
  function go(id, push){
    var el = document.getElementById(id);
    if(!el) return;
    openAncestors(el);
    requestAnimationFrame(function(){
      el.scrollIntoView({behavior:'smooth', block:'start'});
      el.classList.add('flash');
      setTimeout(function(){ el.classList.remove('flash'); }, 2200);
    });
    if(push !== false) history.replaceState(null, '', '#' + id);
  }
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href^="#"]');
    if(!a) return;
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    if(!id || !document.getElementById(id)) return;
    e.preventDefault();
    go(id);
  });
  document.addEventListener('click', function(e){
    var b = e.target.closest && e.target.closest('.toolbar button');
    if(!b) return;
    var open = b.getAttribute('data-act') === 'expand';
    var list = document.querySelectorAll('details');
    for(var i=0;i<list.length;i++) list[i].open = open;
  });
  if(location.hash.length > 1) setTimeout(function(){ go(decodeURIComponent(location.hash.slice(1)), false); }, 120);
})();
`;

const out = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>以日为鉴：衰退时代生存指南 · 导读 + 原文</title>
<style>${css}</style>
</head>
<body>
<header class="top"><div class="inner">
${cover ? `<img class="cover" src="${cover}" alt="封面">` : ''}
<div>
<h1>以日为鉴：衰退时代生存指南</h1>
<div class="meta">分析师Boden ｜ 开明出版社 2025.08 ｜ 126千字 ｜ 5篇15章 ｜ ISBN 9787513196093<br>
单文件成品：顶部凝练导读 + 下方逐字原文（按章折叠，点 ▶原文 自动展开并高亮）</div>
</div>
</div></header>
<div class="wrap">
<section id="guide">${guideHtml}</section>
<div class="toolbar">
<button data-act="expand">展开全部原文</button>
<button data-act="collapse">收起全部</button>
<span class="tip">共 ${parsed.length - skip.size} 个折叠单元 · 点标题展开</span>
</div>
<div id="book">
${html.join('\n')}
</div>
</div>
<a class="gotoguide" href="#guide">↑ 导读</a>
<script>${js}</script>
</body>
</html>`;

fs.writeFileSync(OUT_HTML, out, 'utf8');

// 同步生成精简版 Markdown（顶部导读 + 各章速览，不含原文）
const mdParts = [fs.readFileSync(path.join(BASE, '导读-顶部.md'), 'utf8').replace(/^\uFEFF/, '').trim(), '\n---\n\n# 附：各章速览\n'];
for (const meta of partsMeta) {
  const g = partGuide.get(meta.partKey);
  mdParts.push(`\n## ${g.title}\n`);
  for (const k of meta.keys) {
    const cg = chapterGuide.get(k);
    if (!cg) continue;
    mdParts.push(`\n### ${byKey.get(k)?.title || k}\n\n**一句话主旨**：${cg.oneline}\n\n${cg.md}\n`);
  }
}
fs.writeFileSync(OUT_MD, mdParts.join('\n'), 'utf8');

console.log('导读.html:', (fs.statSync(OUT_HTML).size / 1048576).toFixed(2), 'MB');
console.log('折叠单元:', parsed.length - skip.size, '| 章级速览:', chapterGuide.size, '| 篇级附加:', [...partGuide.values()].reduce((s, p) => s + p.extras.length, 0));
console.log('导读.md:', (fs.statSync(OUT_MD).size / 1024).toFixed(0), 'KB');
