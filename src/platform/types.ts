/**
 * Слой платформы. Игра никогда не обращается к SDK (Telegram Mini Apps) напрямую —
 * только через этот интерфейс.
 */
export type SaveBlob = Record<string, unknown>;

export interface Platform {
  readonly kind: 'telegram' | 'mock';
  /** Сырой код языка окружения (например, `ru`, `en`, `tr`). */
  readonly rawLang: string;

  /** Главное меню стало интерактивным. Вызывается ровно один раз. */
  loadingReady(): void;
  /** Уровень стал интерактивным. Два start подряд не уходят в SDK. */
  gameplayStart(): void;
  /** Пауза, меню, итог, реклама. Два stop подряд не уходят в SDK. */
  gameplayStop(): void;

  /** Внешняя пауза (SDK или скрытие вкладки). */
  onPause(cb: () => void): void;
  onResume(cb: () => void): void;

  /** Полноэкранная реклама. Разрешается после закрытия (или сразу, если показ невозможен). */
  showFullscreenAd(): Promise<void>;
  /** Rewarded-реклама. `true` — только если пришёл `onRewarded`. */
  showRewardedAd(): Promise<boolean>;

  loadData(): Promise<SaveBlob | null>;
  saveData(data: SaveBlob, flush: boolean): Promise<void>;

  isAuthorized(): boolean;
  login(): Promise<boolean>;

  /** Есть ли настоящая реклама. Без неё «продолжить за рекламу» выдаётся бесплатно. */
  readonly hasAds: boolean;
  /** Тактильный отклик (Telegram HapticFeedback). Необязателен. */
  haptic?(kind: HapticKind): void;
  /** Системная кнопка «назад» (Telegram BackButton). Необязательна. */
  setBackButton?(visible: boolean, onClick: () => void): void;
}

export type HapticKind = 'miss' | 'win' | 'fail';
