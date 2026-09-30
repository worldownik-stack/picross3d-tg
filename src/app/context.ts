import type { Platform } from '../platform';
import type { Router } from '../ui/router';
import type { SettingsStore } from './settings';
import type { ContentIndex } from './content';
import type { LevelStore } from './levels';

/** Общие сервисы, доступные экранам. */
export interface AppContext {
  readonly platform: Platform;
  readonly router: Router;
  readonly settings: SettingsStore;
  readonly content: ContentIndex;
  readonly levels: LevelStore;
  readonly stage: HTMLElement;
}
