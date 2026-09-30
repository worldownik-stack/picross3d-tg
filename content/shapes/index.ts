import type { ShapeDef } from './types';
import { tutChair, tutHouse, tutLetterT, tutSteps, tutTable } from './tutorial';
import { testBall, testDonut, testMug, testMushroom, testPyramid } from './test';

export type { ShapeDef } from './types';

/** Реестр фигур DSL: имя из manifest → построитель. */
export const SHAPES: Record<string, () => ShapeDef> = {
  tutSteps,
  tutLetterT,
  tutChair,
  tutTable,
  tutHouse,
  testBall,
  testPyramid,
  testMug,
  testDonut,
  testMushroom,
};
