#!/usr/bin/env node
// Workflow politika kontrolü (CI'da çalışır). Kural ihlalinde derleme kırılır:
//  1. pull_request_target tetikleyicisi yasak (fork PR'ına sırlarla kod çalıştırır)
//  2. Tüm "uses:" referansları 40 karakterlik commit SHA ile sabitlenmeli
//  3. Her workflow en üstte "permissions:" tanımlamalı
//  4. Her job harden-runner ile başlamalı
import { readdir, readFile } from 'node:fs/promises';

const dir = '.github/workflows';
const problems = [];
for (const file of await readdir(dir)) {
  if (!/\.ya?ml$/.test(file)) continue;
  const text = await readFile(`${dir}/${file}`, 'utf8');
  if (/^\s*pull_request_target\s*:/m.test(text)) problems.push(`${file}: pull_request_target kullanılmış`);
  if (!/^permissions\s*:/m.test(text)) problems.push(`${file}: en üstte permissions tanımı yok`);
  text.split(/\r?\n/).forEach((line, i) => {
    const m = line.match(/^\s*-?\s*uses:\s*([^\s#]+)/);
    if (m && !m[1].startsWith('./') && !/@[0-9a-f]{40}$/.test(m[1])) {
      problems.push(`${file}:${i + 1}: SHA ile sabitlenmemiş: ${m[1]}`);
    }
  });
  text.split(/^\s+steps:\s*$/m).slice(1).forEach((s, i) => {
    const first = s.match(/uses:\s*([^\s@]+)/)?.[1];
    if (first !== 'step-security/harden-runner') problems.push(`${file}: ${i + 1}. job harden-runner ile başlamıyor`);
  });
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log('Workflow politikası: tüm kontroller geçti');
