// 用法: node check.mjs p-a p-b ...  校验锚点存在并打印原文，确认摘要未失真
import fs from 'node:fs';
const BASE = 'D:/AI/DS harness/book-yiriweijian';
const anchors = JSON.parse(fs.readFileSync(BASE + '/anchors.json', 'utf8'));
let bad = 0;
for (const id of process.argv.slice(2)) {
  const a = anchors[id];
  if (!a) { console.log(`!! 不存在: ${id}`); bad++; continue; }
  console.log(`[${id}] (${a.kind}) ${a.text.slice(0, 120)}`);
}
console.log(`\n检查 ${process.argv.length - 2} 个锚点，缺失 ${bad} 个`);
