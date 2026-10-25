/**
 * 靜態檢查：HTML id ↔ JS 引用、i18n key、語音檔、殘留舊功能、JS 語法
 * 用法：node scripts/audit.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const load = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const html = load('index.html');
const i18n = load('src/i18n.js');
const jsFiles = [];
(function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel);
    else if (e.name.endsWith('.js')) jsFiles.push(rel);
  }
})('src');
jsFiles.push('index.html');

const problems = [];
const notes = [];

// 1) 語法
for (const f of jsFiles) {
  if (!f.endsWith('.js')) continue;
  try {
    execSync(`node --check ${JSON.stringify(path.join(ROOT, f))}`, { stdio: 'pipe' });
  } catch (e) {
    problems.push(`[syntax] ${f}: ${String(e.stderr || e).slice(0, 200)}`);
  }
}

// 2) HTML id 集合
const ids = new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));

// 3) JS 內 getElementById / querySelector('#..') 引用的 id
const jsText = jsFiles.filter((f) => f.endsWith('.js')).map((f) => [f, load(f)]);
const refs = new Map();
for (const [f, src] of jsText) {
  for (const m of src.matchAll(/getElementById\(\s*['"]([^'"]+)['"]/g)) {
    if (!refs.has(m[1])) refs.set(m[1], []);
    refs.get(m[1]).push(f);
  }
}
for (const [id, where] of refs) {
  if (!ids.has(id)) problems.push(`[dom] getElementById('${id}') 在 HTML 中不存在（${[...new Set(where)].join(', ')}）`);
}

// 4) i18n：解析 key（en 為基準）
const zhMarker = i18n.search(/['"]zh['"]\s*:\s*\{/);
const enBlock = i18n.slice(i18n.indexOf('en: {'), zhMarker);
const zhBlock = i18n.slice(zhMarker);
const keysOf = (blk) => new Set([...blk.matchAll(/^\s{8}([a-zA-Z0-9_]+):/gm)].map((m) => m[1]));
const enKeys = keysOf(enBlock);
const zhKeys = keysOf(zhBlock);

for (const k of enKeys) if (!zhKeys.has(k)) problems.push(`[i18n] 中文缺少 key: ${k}`);
for (const k of zhKeys) if (!enKeys.has(k)) problems.push(`[i18n] 英文缺少 key: ${k}`);

// JS 中 t('key') 與 HTML 中 data-i18n="key"
const usedKeys = new Set();
for (const [f, src] of jsText) {
  if (f.includes('tailwindcss')) continue;   // Tailwind 設定檔裡也有 t( 字樣
  for (const m of src.matchAll(/(?<![A-Za-z0-9_$.])t\(\s*['"]([a-zA-Z0-9_]+)['"]/g)) usedKeys.add(m[1]);
}
for (const m of html.matchAll(/data-i18n="([^"]+)"/g)) usedKeys.add(m[1]);
for (const k of usedKeys) if (!enKeys.has(k)) problems.push(`[i18n] 使用了未定義的 key: ${k}`);

// 5) 語音檔引用 vs 檔案
const audioFiles = new Set();
for (const dir of ['src/assets/mp3/voice', 'src/assets/mp3/voice_en']) {
  for (const f of fs.readdirSync(path.join(ROOT, dir))) if (f.endsWith('.mp3')) audioFiles.add(`${dir}/${f}`);
}
const audio = load('src/audio.js');
const HAND_TYPES = ['single', 'pair', 'triple', 'straight', 'flush', 'fullhouse', 'fourwithone', 'straightflush', 'dragon'];
const expected = [];
for (const t of ['single', 'pair', 'triple']) for (let r = 0; r < 13; r++) expected.push(`${t}_${r}`);
for (const t of ['straight', 'flush', 'fullhouse', 'fourwithone', 'straightflush', 'dragon']) expected.push(t);
for (const p of ['cat', 'dog', 'beaver', 'you']) { expected.push(`declare_${p}`); expected.push(`pass_${p}`); }
for (const dir of ['src/assets/mp3/voice', 'src/assets/mp3/voice_en']) {
  for (const k of expected) {
    if (!audioFiles.has(`${dir}/${k}.mp3`)) problems.push(`[audio] 缺少檔案 ${dir}/${k}.mp3`);
  }
}
notes.push(`語音檔：voice ${fs.readdirSync(path.join(ROOT, 'src/assets/mp3/voice')).length} 個、voice_en ${fs.readdirSync(path.join(ROOT, 'src/assets/mp3/voice_en')).length} 個`);

// 6) 殘留舊功能
const leftovers = [
  ['btn-shout', 'btnShout'], ['shoutLa', 'updateShoutButton'], ['playDeclareSample', 'playDeclareSample'],
  ['playBGM', 'switchBGM'], ['audioSrc_la', 'la_cat'], ['tab-keyboard', 'tab-license'],
  ['game-rule-mode', 'license-sponsor-text-element'],
  ['ai-level-normal', 'aiLevel'],   // v1.5.59 取消「對手強度」分頁，改為固定困難
  ['ruleMode', 'ruleModeMigratedMainland'],   // v1.5.60 只剩大陸規則，移除台/港規則切換
];
for (const [a, b] of leftovers) {
  for (const f of ['index.html', ...jsFiles.filter((x) => x.endsWith('.js'))]) {
    const src = f === 'index.html' ? html : load(f);
    for (const needle of [a, b]) {
      if (src.includes(needle)) problems.push(`[leftover] ${f} 仍引用舊功能 "${needle}"`);
    }
  }
}

// 7) 重複函式宣告
const decls = new Map();
for (const [f, src] of jsText) {
  for (const m of src.matchAll(/^function\s+([A-Za-z0-9_]+)\s*\(/gm)) {
    if (!decls.has(m[1])) decls.set(m[1], []);
    decls.get(m[1]).push(f);
  }
}
for (const [name, files] of decls) {
  if (files.length > 1) notes.push(`重複宣告（跨檔）: ${name} -> ${files.join(', ')}`);
}

// 8) www 與 src 是否同步
try {
  const diff = execSync('diff -rq src www/src', { cwd: ROOT, stdio: 'pipe' }).toString();
  if (diff.trim()) problems.push(`[sync] www/src 與 src 不一致:\n${diff}`);
} catch (e) {
  if (String(e.stdout || '').trim()) problems.push(`[sync] www/src 與 src 不一致:\n${String(e.stdout)}`);
}

console.log('=== JS 檔案數：', jsFiles.length - 1);
console.log('=== HTML id 數：', ids.size, '／JS 引用 id 數：', refs.size);
console.log('=== i18n key：en', enKeys.size, 'zh', zhKeys.size, '使用中', usedKeys.size);
console.log('=== 備註 ===');
notes.forEach((n) => console.log(' -', n));
console.log('=== 問題 ===');
if (!problems.length) console.log(' 無');
problems.forEach((p) => console.log(' ✗', p));
process.exit(problems.length ? 1 : 0);
