/**
 * Промты и параметры Meshy (§6.1, Приложение А). Используются только при подготовке
 * контента — игра Meshy никогда не вызывает (п. 1.23).
 */

export const PREVIEW_TEMPLATE =
  'Cute stylized toy figurine of {OBJECT}. Single object, centered, facing forward, no base, no ground, no background. Chunky simplified rounded proportions, thick solid parts, bold readable silhouette, no thin or tiny details, closed solid mesh. No text, no logos.';

export const TEXTURE_TEMPLATE =
  'Flat hand-painted toy colors: {COLORS}. Large clean areas of solid color, bright friendly palette, no baked lighting, no shadows, no gradients, no fine patterns, no text, no logos.';

export const MAX_PROMPT = 800;

/** Параметры preview (§6.1). */
export const PREVIEW_PARAMS = {
  mode: 'preview',
  ai_model: 'latest',
  topology: 'triangle',
  target_polycount: 8000,
  should_remesh: true,
  target_formats: ['glb'],
} as const;

/** Параметры refine (§6.1). */
export const REFINE_PARAMS = {
  mode: 'refine',
  enable_pbr: false,
  remove_lighting: true,
} as const;

export function previewPrompt(object: string): string {
  const p = PREVIEW_TEMPLATE.replace('{OBJECT}', object.trim());
  if (p.length > MAX_PROMPT) throw new Error(`preview prompt too long (${p.length})`);
  return p;
}

export function texturePrompt(colors: string): string {
  const p = TEXTURE_TEMPLATE.replace('{COLORS}', colors.trim());
  if (p.length > MAX_PROMPT) throw new Error(`texture prompt too long (${p.length})`);
  return p;
}

/** Статус задачи Meshy в manifest. */
export interface MeshyTaskRecord {
  taskId: string | null;
  status: 'pending' | 'in_progress' | 'succeeded' | 'failed';
  /** Кредиты, списанные за задачу. */
  credits?: number;
  /** Фактические параметры запроса. */
  params?: Record<string, unknown>;
  finishedAt?: string;
}

/** Учёт генерации объекта в manifest (§6.1: пайплайн возобновляемый). */
export interface MeshyRecord {
  preview: MeshyTaskRecord;
  refine: MeshyTaskRecord;
  /** Сколько раз объект перегенерировался (не больше двух, §6.3). */
  regenerations: number;
  /** Если объект заменён резервным (Приложение А.4). */
  replacedBecause?: string;
}
