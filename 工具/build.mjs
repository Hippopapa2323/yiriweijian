// 把 EPUB 转成：1) 自包含的逐字原文阅读版 HTML（每段一个锚点） 2) 带锚点的纯文本 3) anchors.json
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'D:/AI/DS harness/book-yiriweijian';
const RAW = path.join(BASE, 'raw');
const TEXTDIR = path.join(BASE, 'text');
fs.mkdirSync(TEXTDIR, { recursive: true });

const opf = fs.readFileSync(path.join(RAW, 'content.opf'), 'utf8');
const manifest = new Map();
for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/g)) {
  const a = m[1];
  const id = /\bid="([^"]+)"/.exec(a)?.[1];
  const href = /\bhref="([^"]+)"/.exec(a)?.[1];
  if (id && href) manifest.set(id, href);
}
const spine = [...opf.matchAll(/<itemref\b[^>]*idref="([^"]+)"[^>]*>/g)].map((m) => m[1]);

const ent = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
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
    const mime = ext === '.png' ? 'image/png' : ext === '.gif' ? 'image/gif' : ext === '.svg' ? 'image/svg+xml' : 'image/jpeg';
    u = `data:${mime};base64,${buf.toString('base64')}`;
  } catch { u = ''; }
  uriCache.set(p, u);
  return u;
}

const TOKEN = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>|<p\b[^>]*>([\s\S]*?)<\/p>|<aside\b([^>]*)>([\s\S]*?)<\/aside>|<img\b([^>]*?)\/?>/g;
const secHeadRe = /^[（(]?[一二三四五六七八九十百]+[）)、.]\s*\S/;

const chapters = [];
const anchors = {};
const footnotes = [];

// 第一遍：拆块
const parsed = [];
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
      // 标题
      const lvl = Math.min(3, Math.max(1, +m[1]));
      const text = strip(m[2]);
      if (!text) continue;
      const aid = `h-${key}-${++hn}`;
      blocks.push({ kind: 'h', aid, level: lvl, text, html: `<h${lvl + 1} id="${aid}">${m[2].trim()}</h${lvl + 1}>` });
    } else if (m[3] !== undefined) {
      let html = m[3];
      const text0 = strip(html);
      if (!text0) continue;
      const isSec = text0.length <= 40 && secHeadRe.test(text0) && /calibre19|calibre22/.test(html);
      const aid = isSec ? `s-${key}-${++sn}` : `p-${key}-${++pn}`;
      if (!isSec) pn = pn; // 段落号连续
      // 脚注引用上标 -> 链接
      html = html.replace(/<sup\b[^>]*>([\s\S]*?)<\/sup>/g, (all, inner) => {
        const h = /href="#([^"]+)"/.exec(inner)?.[1];
        return h ? `<sup class="fnref"><a href="#fn-${h}" title="查看脚注">[注]</a></sup>` : '';
      });
      // 段内残留图片 -> 图
      html = html.replace(/<img\b([^>]*?)\/?>/g, (all2, a) => {
        const srcAttr = /src="([^"]+)"/.exec(a)?.[1];
        const alt = ent(/alt="([^"]*)"/.exec(a)?.[1] ?? '');
        const u = srcAttr ? dataUri(srcAttr) : '';
        return u ? `<figure><img src="${u}" alt="${esc(alt)}">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>` : '';
      });
      if (isSec) blocks.push({ kind: 'sec', aid, text: text0, html: `<h4 class="sec" id="${aid}">${html}</h4>` });
      else blocks.push({ kind: 'p', aid, text: text0, html: `<p id="${aid}">${html}</p>` });
    } else if (m[4] !== undefined) {
      const fid = /id="([^"]+)"/.exec(m[4])?.[1] ?? `anon${footnotes.length}`;
      const text = strip(m[5]);
      if (!text) continue;
      const aid = `fn-${fid}`;
      blocks.push({ kind: 'fn', aid, text, html: `<div class="footnote" id="${aid}"><span class="fnlabel">脚注</span>${esc(text)}</div>` });
    } else if (m[6] !== undefined) {
      const srcAttr = /src="([^"]+)"/.exec(m[6])?.[1];
      const alt = ent(/alt="([^"]*)"/.exec(m[6])?.[1] ?? '');
      const u = srcAttr ? dataUri(srcAttr) : '';
      if (!u) continue;
      const aid = `img-${key}-${blocks.length}`;
      blocks.push({ kind: 'img', aid, text: alt || '（图片）', html: `<figure id="${aid}"><img src="${u}" alt="${esc(alt)}">${alt ? `<figcaption>${esc(alt)}</figcaption>` : ''}</figure>` });
    }
  }
  const firstH = blocks.find((b) => b.kind === 'h');
  parsed.push({ key, title: firstH?.text || title, blocks });
}

// 生成章级锚点：每个章节文件一个
for (const ch of parsed) {
  for (const b of ch.blocks) anchors[b.aid] = { chapter: ch.key, title: ch.title, kind: b.kind, text: b.text };
  anchors[`ch-${ch.key}`] = { chapter: ch.key, title: ch.title, kind: 'chapter', text: ch.title };
}

// 渲染自包含 HTML
const css = `
:root{--fg:#1c1c1e;--muted:#6b6b70;--bd:#e3e3e6;--hl:#fff3bf;--acc:#8a5a2b}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:#f6f5f2;color:var(--fg);font-family:"PingFang SC","Microsoft YaHei","Hiragino Sans GB","Source Han Sans SC",system-ui,sans-serif;line-height:1.95;font-size:17px}
a{color:#1a5fb4;text-decoration:none}
a:hover{text-decoration:underline}
.wrap{max-width:820px;margin:0 auto;padding:0 20px 120px}
header.top{background:#fff;border-bottom:1px solid var(--bd);padding:28px 20px 20px;margin-bottom:24px}
header.top .inner{max-width:820px;margin:0 auto}
header.top h1{font-size:26px;margin:0 0 6px}
header.top .meta{color:var(--muted);font-size:14px}
#toc{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:18px 22px;margin:0 0 34px}
#toc h2{font-size:16px;margin:0 0 10px;color:var(--muted);letter-spacing:.08em}
#toc ol{margin:0;padding-left:22px}
#toc li{margin:3px 0;font-size:15px}
#toc .part{font-weight:700;margin-top:10px;list-style:none;margin-left:-22px;color:var(--acc)}
main>section{background:#fff;border:1px solid var(--bd);border-radius:10px;padding:26px 30px 34px;margin:0 0 26px}
main h2{font-size:22px;line-height:1.5;margin:6px 0 18px;padding-bottom:12px;border-bottom:2px solid #efece7}
main h3{font-size:19px;line-height:1.5;margin:8px 0 16px}
main h4.sec{font-size:17px;margin:30px 0 10px;color:var(--acc)}
main p{margin:0 0 15px;text-indent:2em}
main p:target,main h4:target,main h3:target,main h2:target{background:var(--hl);box-shadow:0 0 0 6px var(--hl);border-radius:3px}
figure{margin:20px 0;text-align:center}
figure img{max-width:100%;border-radius:6px}
figcaption{color:var(--muted);font-size:13px;margin-top:6px}
.footnote{background:#faf8f4;border-left:3px solid #ddd3c4;padding:8px 12px;margin:0 0 15px;font-size:14px;line-height:1.75;color:#4a4a4e}
.fnlabel{display:inline-block;background:#e8e2d6;color:#6b5a3e;border-radius:3px;padding:0 6px;margin-right:8px;font-size:12px}
sup.fnref a{font-size:12px;padding:0 2px}
.backtop{position:fixed;right:18px;bottom:18px;background:#fff;border:1px solid var(--bd);border-radius:20px;padding:8px 14px;font-size:14px;box-shadow:0 2px 10px rgba(0,0,0,.08)}
.cover{text-align:center}
.cover img{max-width:340px;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.15)}
`;

const chHtml = [];
for (const ch of parsed) {
  const body = ch.blocks
    .filter((b) => b.kind !== 'h' || b.text !== ch.title || ch.blocks.indexOf(b) > 0 || true)
    .map((b) => (b.kind === 'h' && b.text === ch.title ? b.html + '' : b.html))
    .join('\n');
  chHtml.push(`<section id="ch-${ch.key}">\n<h1 style="display:none"></h1>\n${body}\n<p style="text-align:right;text-indent:0"><a href="#toc">↑ 返回目录</a></p>\n</section>`);
}

// 目录：按 spine 顺序，h1 为篇/章标题，一律列出一级
const tocItems = parsed
  .map((ch) => `<li><a href="#ch-${ch.key}">${esc(ch.title)}</a></li>`)
  .join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>以日为鉴：衰退时代生存指南 — 原文（逐字保留）</title>
<style>${css}</style>
</head>
<body>
<header class="top"><div class="inner">
<h1>以日为鉴：衰退时代生存指南</h1>
<div class="meta">作者：分析师Boden ｜ 开明出版社 ｜ 本页为 EPUB 原文逐字转换，未做任何删改；每章、每节、每段均有独立锚点，可直接跳转引用。</div>
</div></header>
<div class="wrap">
<nav id="toc"><h2>目录</h2><ol>${tocItems}</ol></nav>
<main>
${chHtml.join('\n')}
</main>
</div>
<a class="backtop" href="#toc">目录</a>
</body>
</html>`;
fs.writeFileSync(path.join(BASE, '原文.html'), html, 'utf8');

// 纯文本（带锚点）
const txtAll = [];
parsed.forEach((ch, i) => {
  const lines = [`# ${ch.title}`, `（锚点：ch-${ch.key}）`, ''];
  for (const b of ch.blocks) {
    if (b.kind === 'h') lines.push(`## [${b.aid}] ${b.text}`, '');
    else if (b.kind === 'sec') lines.push(`### [${b.aid}] ${b.text}`, '');
    else if (b.kind === 'p') lines.push(`[${b.aid}] ${b.text}`, '');
    else if (b.kind === 'fn') lines.push(`[${b.aid}] (脚注) ${b.text}`, '');
    else if (b.kind === 'img') lines.push(`[${b.aid}] (图片) ${b.text}`, '');
  }
  const t = lines.join('\n');
  fs.writeFileSync(path.join(TEXTDIR, `${String(i + 1).padStart(2, '0')}-${ch.key}.txt`), t, 'utf8');
  txtAll.push(t);
});
fs.writeFileSync(path.join(TEXTDIR, '00-全书.txt'), txtAll.join('\n\n\n'), 'utf8');
fs.writeFileSync(path.join(BASE, 'anchors.json'), JSON.stringify(anchors, null, 1), 'utf8');

const totalChars = parsed.reduce((s, c) => s + c.blocks.filter((b) => b.kind === 'p').reduce((t, b) => t + b.text.length, 0), 0);
console.log('章节数:', parsed.length);
console.log('段落总数:', Object.values(anchors).filter((a) => a.kind === 'p').length);
console.log('正文汉字量(约):', totalChars);
console.log('原文.html 大小(MB):', (fs.statSync(path.join(BASE, '原文.html')).size / 1048576).toFixed(2));
console.log(parsed.map((c) => `${c.key} | ${c.title}`).join('\n'));
