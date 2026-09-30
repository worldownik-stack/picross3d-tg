/** Заменяется Vite через `define`: true в dev и debug-сборке, false в prod. */
declare const __DEBUG__: boolean;
/** Версия сборки из package.json. */
declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  /** Adsgram: ID блока rewarded-рекламы (опционально). */
  readonly VITE_ADSGRAM_REWARDED_BLOCK_ID?: string;
  /** Adsgram: ID блока interstitial-рекламы (опционально). */
  readonly VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID?: string;
  /** `1` — просить у Telegram полноэкранный режим на мобильных. */
  readonly VITE_TG_FULLSCREEN?: string;
}
