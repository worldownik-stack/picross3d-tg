import { computeClues } from '../../src/core/clues';
import { Grid } from '../../src/core/grid';
import { makePuzzle, type Puzzle } from '../../src/core/puzzle';
import { mulberry32, type Rng } from '../../src/core/rng';
import type { Size3 } from '../../src/core/types';

export function randomCells(n: number, rng: Rng, density = 0.5): Uint8Array {
  const c = new Uint8Array(n);
  for (let i = 0; i < n; i++) c[i] = rng() < density ? 1 : 0;
  return c;
}

export function randomPuzzle(size: Size3, seed: number, density = 0.5, hideRatio = 0): Puzzle {
  const rng = mulberry32(seed);
  const grid = new Grid(size);
  const cells = randomCells(grid.cellCount, rng, density);
  const hidden = new Uint8Array(grid.totalLines);
  for (let g = 0; g < hidden.length; g++) hidden[g] = rng() < hideRatio ? 1 : 0;
  return makePuzzle(grid, cells, 'classic', hidden);
}

/** Полный перебор: число заполнений, удовлетворяющих всем видимым подсказкам. */
export function bruteForceCount(p: Puzzle): number {
  const n = p.grid.cellCount;
  if (n > 16) throw new Error('too big for brute force');
  let count = 0;
  const cells = new Uint8Array(n);
  for (let m = 0; m < 1 << n; m++) {
    for (let i = 0; i < n; i++) cells[i] = (m >> i) & 1;
    const clues = computeClues(p.grid, cells, 'classic');
    let ok = true;
    for (let g = 0; g < p.grid.totalLines && ok; g++) {
      if (p.hidden[g]) continue;
      const a = clues[g]!.parts[0]!;
      const b = p.clues[g]!.parts[0]!;
      ok = a.count === b.count && a.groups === b.groups;
    }
    if (ok) count++;
  }
  return count;
}
