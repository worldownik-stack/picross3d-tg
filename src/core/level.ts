import { classicClasses } from './clues';
import { decodeBitset, decodeRle, encodeBitset, encodeRle } from './codec';
import { Grid } from './grid';
import { makePuzzle, type Puzzle } from './puzzle';
import {
  AXIS_NAMES,
  REVEAL_ANIMS,
  type Axis,
  type LocalizedText,
  type RevealAnim,
  type Ruleset,
  type Size3,
} from './types';

/** Максимальная сторона поля, которую принимает загрузчик уровней. */
export const MAX_SIDE = 24;

/** Уровень в JSON-файле набора (§5.1). Подсказки не хранятся. */
export interface LevelJson {
  id: string;
  pack: string;
  title: LocalizedText;
  size: [number, number, number];
  ruleset: Ruleset;
  /** RLE→base64: индекс цвета палитры на ячейку, 0 = пусто. */
  cells: string;
  palette: string[];
  /** Битсеты скрытых подсказок по осям (номер линии внутри оси). */
  hidden: { x: string; y: string; z: string };
  difficulty: number;
  targetTime: number;
  anim: RevealAnim;
  /** Гладкая модель для «оживления» (опционально). */
  reveal?: string;
}

export interface PackJson {
  version: number;
  pack: string;
  levels: LevelJson[];
}

/** Уровень в памяти. */
export interface Level {
  id: string;
  pack: string;
  title: LocalizedText;
  size: Size3;
  ruleset: Ruleset;
  /** Индекс цвета палитры (1..), 0 — пусто. */
  cells: Uint8Array;
  palette: string[];
  /** Скрытые подсказки по глобальному номеру линии. */
  hidden: Uint8Array;
  difficulty: number;
  targetTime: number;
  anim: RevealAnim;
  reveal?: string;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function parseLevel(j: LevelJson): Level {
  assert(typeof j.id === 'string' && j.id, 'level id');
  assert(Array.isArray(j.size) && j.size.length === 3, `${j.id}: size`);
  for (const s of j.size) assert(Number.isInteger(s) && s >= 1 && s <= MAX_SIDE, `${j.id}: size`);
  assert(j.ruleset === 'classic' || j.ruleset === 'dual', `${j.id}: ruleset`);
  assert(Array.isArray(j.palette) && j.palette.length > 0, `${j.id}: palette`);
  assert(REVEAL_ANIMS.includes(j.anim), `${j.id}: anim`);
  const size: Size3 = [j.size[0], j.size[1], j.size[2]];
  const grid = new Grid(size);
  const cells = decodeRle(j.cells, grid.cellCount);
  for (let i = 0; i < cells.length; i++) {
    assert(cells[i]! <= j.palette.length, `${j.id}: palette index out of range`);
  }
  const hidden = new Uint8Array(grid.totalLines);
  for (let a = 0; a < 3; a++) {
    const bits = decodeBitset(j.hidden?.[AXIS_NAMES[a]!] ?? '', grid.lineCounts[a as Axis]);
    hidden.set(bits, grid.lineOffset[a as Axis]);
  }
  const level: Level = {
    id: j.id,
    pack: j.pack,
    title: j.title,
    size,
    ruleset: j.ruleset,
    cells,
    palette: j.palette,
    hidden,
    difficulty: j.difficulty,
    targetTime: j.targetTime,
    anim: j.anim,
  };
  if (j.reveal) level.reveal = j.reveal;
  return level;
}

export function serializeLevel(l: Level): LevelJson {
  const grid = new Grid(l.size);
  const hidden = { x: '', y: '', z: '' };
  for (let a = 0; a < 3; a++) {
    const from = grid.lineOffset[a as Axis];
    const bits = l.hidden.subarray(from, from + grid.lineCounts[a as Axis]);
    hidden[AXIS_NAMES[a]!] = bits.some((b) => b) ? encodeBitset(bits) : '';
  }
  const j: LevelJson = {
    id: l.id,
    pack: l.pack,
    title: l.title,
    size: [l.size[0], l.size[1], l.size[2]],
    ruleset: l.ruleset,
    cells: encodeRle(l.cells),
    palette: l.palette,
    hidden,
    difficulty: l.difficulty,
    targetTime: l.targetTime,
    anim: l.anim,
  };
  if (l.reveal) j.reveal = l.reveal;
  return j;
}

/** Головоломка уровня. В classic решение — `cells > 0` (§5.1). */
export function levelPuzzle(l: Level): Puzzle {
  if (l.ruleset !== 'classic') throw new Error(`ruleset ${l.ruleset} is not supported yet`);
  return makePuzzle(new Grid(l.size), classicClasses(l.cells), l.ruleset, l.hidden);
}
