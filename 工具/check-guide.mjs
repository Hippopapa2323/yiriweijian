// 校验导读中所有 ▶原文 跳转目标存在
import fs from 'node:fs';
import path from 'node:path';
const BASE = 'D:/AI/DS harness/book-yiriweijian';
const anchors = JSON.parse(fs.readFileSync(BASE + '/anchors.json', 'utf8'));
const dir = path.join(BASE, '导读-parts');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md')).sort();
let all = 0, bad = [];
for (const f of files) {
  const txt = fs.readFileSync(path.join(dir, f), 'utf8');
  const refs = [...txt.matchAll(/\]\(#([^)]+)\)/g)].map((m) => m[1]);
  const miss = refs.filter((r) => !anchors[r]);
  all += refs.length;
  console.log(`${f}: ${refs.length} 个跳转，缺失 ${miss.length}${miss.length ? ' -> ' + [...new Set(miss)].join(', ') : ''}`);
  bad.push(...miss);
}
console.log(`\n合计 ${all} 个跳转，缺失 ${new Set(bad).size}`);
