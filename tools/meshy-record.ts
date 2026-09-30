/**
 * Учёт генераций Meshy в content/manifest.json (§6.1, §12: каждая генерация — в manifest).
 *   tsx tools/meshy-record.ts <id> <preview|refine> <taskId> <status> [credits] [paramsJson]
 *   tsx tools/meshy-record.ts summary
 * Статусы: pending | in_progress | succeeded | failed.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import type { Manifest } from '../content/build';
import type { MeshyTaskRecord } from '../content/meshy';

const PATH = 'content/manifest.json';
const manifest = JSON.parse(readFileSync(PATH, 'utf8')) as Manifest;
const levels = manifest.packs.flatMap((p) => p.levels).filter((l) => l.source.kind === 'meshy');
const [cmd, stage, taskId, status, credits, params] = process.argv.slice(2);

if (!cmd || cmd === 'summary') {
  let total = 0;
  const lines: string[] = [];
  for (const l of levels) {
    const m = l.meshy;
    if (!m) continue;
    const c = (m.preview.credits ?? 0) + (m.refine.credits ?? 0);
    total += c;
    if (m.preview.taskId || m.refine.taskId) {
      lines.push(
        `${l.id.padEnd(8)} preview ${m.preview.status.padEnd(11)} refine ${m.refine.status.padEnd(11)} кредиты ${c}${m.regenerations ? ` перегенераций ${m.regenerations}` : ''}`,
      );
    }
  }
  console.log(lines.join('\n') || 'генераций ещё не было');
  console.log(`итого кредитов: ${total}`);
  process.exit(0);
}

const lvl = levels.find((l) => l.id === cmd);
if (!lvl?.meshy) throw new Error(`нет Meshy-уровня ${cmd}`);
if (stage !== 'preview' && stage !== 'refine') throw new Error('stage: preview | refine');
const allowed = ['pending', 'in_progress', 'succeeded', 'failed'];
if (!status || !allowed.includes(status)) throw new Error(`status: ${allowed.join(' | ')}`);
const rec: MeshyTaskRecord = {
  ...lvl.meshy[stage],
  taskId: taskId ?? null,
  status: status as MeshyTaskRecord['status'],
};
if (credits !== undefined) rec.credits = Number(credits);
if (params) rec.params = JSON.parse(params) as Record<string, unknown>;
if (status === 'succeeded' || status === 'failed') rec.finishedAt = new Date().toISOString();
lvl.meshy[stage] = rec;
// Через Prettier, чтобы запись не переформатировала весь manifest: на вход — JSON с
// отступами (объекты Prettier оставляет развёрнутыми, массивы чисел сворачивает).
const config = await resolveConfig(PATH);
writeFileSync(PATH, await format(JSON.stringify(manifest, null, 2), { ...config, filepath: PATH }));
console.log(`${cmd}.${stage}:`, JSON.stringify(rec));
