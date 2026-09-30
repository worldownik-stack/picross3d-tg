/**
 * Сборка уровней из manifest (§5): фигура → подсказки → прореживание →
 * метрики → сложность и targetTime → JSON. Детерминированно, без I/O.
 */
import { classicClasses, type GroupClass } from '../src/core/clues';
import { measure, rate, type LevelMetrics } from '../src/core/difficulty';
import { Grid } from '../src/core/grid';
import { serializeLevel, type Level, type LevelJson, type PackJson } from '../src/core/level';
import { makePuzzle } from '../src/core/puzzle';
import { isLogicSolvable } from '../src/core/solver';
import { thinClues } from '../src/core/thinning';
import type { LocalizedText, RevealAnim, Size3 } from '../src/core/types';
import { decodeRle } from '../src/core/codec';
import type { ContentIndex } from '../src/app/content';
import { SHAPES, type ShapeDef } from './shapes';
import type { MeshyRecord } from './meshy';

/** Ручные правки вокселей (в координатах итоговой сетки). */
export interface VoxelEditsJson {
  add?: Array<{ min: [number, number, number]; max: [number, number, number]; color?: string }>;
  remove?: Array<{ min: [number, number, number]; max: [number, number, number] }>;
  /** Перекрасить заполненные кубы коробки. */
  paint?: Array<{ min: [number, number, number]; max: [number, number, number]; color: string }>;
}

export type LevelSource =
  | { kind: 'dsl'; shape: string }
  | {
      kind: 'meshy';
      /** {OBJECT} для шаблона preview (Приложение А). */
      object: string;
      /** {COLORS} для шаблона texture_prompt. */
      colors: string;
      /** Длинная сторона сетки; по умолчанию — maxSize набора. */
      maxSize?: number;
      rotation?: [number, number, number];
      threshold?: number;
      /** Цвета фигуры — подмножество палитры игры (иначе — вся палитра). */
      palette?: string[];
      /** Тонкие оболочки считаются заполненными (абажур, зонт, стенки посуды). */
      shell?: boolean;
      edits?: VoxelEditsJson;
    }
  | {
      /** Фигура из MagicaVoxel: content/vox/<id>.vox → `npm run vox` → content/voxels/<id>.json. */
      kind: 'vox';
    };

/** Результат вокселизации (content/voxels/<id>.json). */
export interface VoxelFile {
  id: string;
  size: [number, number, number];
  palette: string[];
  /** RLE→base64, как в уровне. */
  cells: string;
  stats?: Record<string, number>;
}

export interface ManifestLevel {
  id: string;
  title: LocalizedText;
  source: LevelSource;
  anim: RevealAnim;
  targetHidden?: number;
  hideFirst?: GroupClass[];
  /** Ручные переопределения оценки. */
  difficulty?: number;
  targetTime?: number;
  reveal?: string;
  /** Учёт генерации в Meshy (для source.kind = 'meshy'). */
  meshy?: MeshyRecord;
}

export interface ManifestPack {
  id: string;
  title: LocalizedText;
  unlockAfter: number;
  debugOnly?: boolean;
  targetHidden: number;
  hideFirst: GroupClass[];
  /** Длинная сторона сетки уровней набора (Приложение А.2). */
  maxSize?: number;
  levels: ManifestLevel[];
}

export interface Manifest {
  version: number;
  packs: ManifestPack[];
  /** Резерв на замену неудачных объектов (Приложение А.4). */
  reserve?: Array<{ object: string; colors: string }>;
}

export interface BuiltLevel {
  level: Level;
  json: LevelJson;
  metrics: LevelMetrics;
  score: number;
  remainingFirst: number;
}

export interface BuiltContent {
  packs: PackJson[];
  index: ContentIndex;
  levels: BuiltLevel[];
  /** Уровни из manifest, для которых ещё нет вокселей (не сгенерированы). */
  skipped: string[];
}

export interface BuildInputs {
  /** Воксели Meshy- и MagicaVoxel-фигур по id уровня. */
  voxels?: Record<string, VoxelFile>;
}

interface Figure {
  size: Size3;
  cells: Uint8Array;
  palette: string[];
  hideAxes?: Array<'x' | 'y' | 'z'>;
}

function figureOf(entry: ManifestLevel, inputs: BuildInputs): Figure | null {
  const src = entry.source;
  if (src.kind === 'dsl') {
    const fn = SHAPES[src.shape];
    if (!fn) throw new Error(`unknown shape ${src.shape}`);
    const shape: ShapeDef = fn();
    return {
      size: shape.sculpture.size,
      cells: shape.sculpture.cells(),
      palette: shape.palette,
      hideAxes: shape.hideAxes,
    };
  }
  if (src.kind === 'meshy' || src.kind === 'vox') {
    const v = inputs.voxels?.[entry.id];
    if (!v) return null;
    const size: Size3 = [v.size[0], v.size[1], v.size[2]];
    return { size, cells: decodeRle(v.cells, size[0] * size[1] * size[2]), palette: v.palette };
  }
  throw new Error(`unknown level source ${(src as { kind: string }).kind}`);
}

export function buildLevel(
  pack: ManifestPack,
  entry: ManifestLevel,
  inputs: BuildInputs = {},
): BuiltLevel | null {
  const shape = figureOf(entry, inputs);
  if (!shape) return null;
  const grid = new Grid(shape.size);
  const cells = shape.cells;
  let maxColor = 0;
  for (const c of cells) maxColor = Math.max(maxColor, c);
  if (maxColor > shape.palette.length) throw new Error(`${entry.id}: palette too short`);

  const forced = new Uint8Array(grid.totalLines);
  for (const a of shape.hideAxes ?? []) {
    const ai = ({ x: 0, y: 1, z: 2 } as const)[a];
    forced.fill(1, grid.lineOffset[ai], grid.lineOffset[ai] + grid.lineCounts[ai]);
  }
  const base = makePuzzle(grid, classicClasses(cells), 'classic', forced);
  if (!isLogicSolvable(base)) throw new Error(`${entry.id}: not logic-solvable with all clues`);

  const thin = thinClues(base, {
    seed: entry.id,
    targetHidden: entry.targetHidden ?? pack.targetHidden,
    hideFirst: entry.hideFirst ?? pack.hideFirst,
  });
  const metrics = measure(thin.puzzle);
  const rating = rate(metrics);
  const level: Level = {
    id: entry.id,
    pack: pack.id,
    title: entry.title,
    size: shape.size,
    ruleset: 'classic',
    cells,
    palette: shape.palette,
    hidden: thin.hidden,
    difficulty: entry.difficulty ?? rating.difficulty,
    targetTime: entry.targetTime ?? rating.targetTime,
    anim: entry.anim,
  };
  if (entry.reveal) level.reveal = entry.reveal;
  return {
    level,
    json: serializeLevel(level),
    metrics,
    score: rating.score,
    remainingFirst: thin.remainingFirst,
  };
}

export function buildContent(manifest: Manifest, inputs: BuildInputs = {}): BuiltContent {
  const packs: PackJson[] = [];
  const levels: BuiltLevel[] = [];
  const skipped: string[] = [];
  const index: ContentIndex = { version: manifest.version, packs: [] };
  const ids = new Set<string>();
  for (const pack of manifest.packs) {
    const built: BuiltLevel[] = [];
    for (const entry of pack.levels) {
      if (ids.has(entry.id)) throw new Error(`duplicate level id ${entry.id}`);
      ids.add(entry.id);
      const b = buildLevel(pack, entry, inputs);
      if (b) built.push(b);
      else skipped.push(entry.id);
    }
    levels.push(...built);
    packs.push({ version: manifest.version, pack: pack.id, levels: built.map((b) => b.json) });
    index.packs.push({
      id: pack.id,
      title: pack.title,
      unlockAfter: pack.unlockAfter,
      ...(pack.debugOnly ? { debugOnly: true } : {}),
      levels: built.map((b) => ({
        id: b.level.id,
        title: b.level.title,
        size: [b.level.size[0], b.level.size[1], b.level.size[2]],
        difficulty: b.level.difficulty,
      })),
    });
  }
  return { packs, index, levels, skipped };
}

/** Детерминированная сериализация файла набора: по уровню на строку. */
export function stringifyPack(p: PackJson): string {
  const lines = p.levels.map((l) => JSON.stringify(l));
  return `{"version":${p.version},"pack":${JSON.stringify(p.pack)},"levels":[\n${lines.join(',\n')}\n]}\n`;
}

export function stringifyIndex(index: ContentIndex): string {
  return `${JSON.stringify(index, null, 1)}\n`;
}
