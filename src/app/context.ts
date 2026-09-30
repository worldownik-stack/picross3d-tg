import type { Platform } from '../platform';
import type { Router } from '../ui/router';
import type { SettingsStore } from './settings';
import type { ContentIndex } from './content';
import type { LevelStore } from './levels';
import type { ProgressStore } from './progress';
import type { Sound } from '../audio/Sound';

/** Общие сервисы, доступные экранам. */
export interface AppContext {
  readonly platform: Platform;
  readonly router: Router;
  readonly settings: SettingsStore;
  readonly content: ContentIndex;
  readonly levels: LevelStore;
  readonly progress: ProgressStore;
  readonly sound: Sound;
  readonly stage: HTMLElement;
}
