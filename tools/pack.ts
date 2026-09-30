/**
 * `npm run pack`: собирает build.zip из dist/ (index.html в корне архива)
 * и печатает отчёт о размере. Падает, если превышен бюджет (§1):
 *  - всего (распакованно) ≤ 40 МБ;
 *  - до интерактивного меню ≤ 4 МБ gzip.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, dirname, posix } from 'node:path';
import { gzipSync, zipSync, type Zippable } from 'fflate';

const DIST = 'dist';
const TOTAL_BUDGET = 40 * 1024 * 1024;
const INITIAL_GZIP_BUDGET = 4 * 1024 * 1024;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST).map((p) => relative(DIST, p).split('\\').join('/'));
if (!files.includes('index.html')) {
  console.error('dist/index.html не найден — сначала vite build');
  process.exit(1);
}

const zipInput: Zippable = {};
let total = 0;
for (const f of files) {
  const data = readFileSync(join(DIST, f));
  total += data.length;
  zipInput[f] = [data, { level: /\.(png|jpe?g|webp|ogg|woff2|glb|ktx2|zip)$/i.test(f) ? 0 : 9 }];
}
const zip = zipSync(zipInput);
writeFileSync('build.zip', zip);

// Начальная загрузка: index.html, всё, на что он ссылается, CSS-ресурсы и индекс уровней.
const initial = new Set<string>(['index.html']);
const html = readFileSync(join(DIST, 'index.html'), 'utf8');
for (const m of html.matchAll(/(?:src|href)="\.?\/?([^"]+)"/g)) {
  const f = m[1]!;
  if (files.includes(f)) initial.add(f);
}
for (const f of [...initial]) {
  if (!f.endsWith('.css') && !f.endsWith('.js')) continue;
  const text = readFileSync(join(DIST, f), 'utf8');
  for (const m of text.matchAll(/url\(["']?([^"')]+)["']?\)/g)) {
    const ref = posix.normalize(posix.join(dirname(f), m[1]!));
    if (files.includes(ref) && /\.woff2$/.test(ref)) initial.add(ref);
  }
  // Статические импорты других чанков.
  for (const m of text.matchAll(/from\s*["']\.\/([^"']+\.js)["']/g)) {
    const ref = posix.join(dirname(f), m[1]!);
    if (files.includes(ref)) initial.add(ref);
  }
}
if (files.includes('levels/index.json')) initial.add('levels/index.json');

let initialGzip = 0;
const rows: Array<[string, number, number]> = [];
for (const f of [...initial].sort()) {
  const data = readFileSync(join(DIST, f));
  const gz = /\.(woff2|png|webp|ogg)$/.test(f) ? data.length : gzipSync(data, { level: 9 }).length;
  initialGzip += gz;
  rows.push([f, data.length, gz]);
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} КБ`;
const mb = (n: number) => `${(n / 1024 / 1024).toFixed(2)} МБ`;
console.log('\nНачальная загрузка (до меню):');
for (const [f, raw, gz] of rows)
  console.log(`  ${f.padEnd(48)} ${kb(raw).padStart(10)}  gzip ${kb(gz)}`);
console.log(`\nФайлов: ${files.length}`);
console.log(`Всего распакованно: ${mb(total)} (бюджет ${mb(TOTAL_BUDGET)})`);
console.log(`До меню, gzip:      ${mb(initialGzip)} (бюджет ${mb(INITIAL_GZIP_BUDGET)})`);
console.log(`build.zip:          ${mb(zip.length)}`);

let failed = false;
if (total > TOTAL_BUDGET) {
  console.error('ПРЕВЫШЕН общий бюджет размера');
  failed = true;
}
if (initialGzip > INITIAL_GZIP_BUDGET) {
  console.error('ПРЕВЫШЕН бюджет начальной загрузки');
  failed = true;
}
process.exit(failed ? 1 : 0);
