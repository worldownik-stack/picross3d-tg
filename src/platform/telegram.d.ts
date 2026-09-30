/** Минимальное описание Telegram Mini Apps SDK (только то, что использует игра). */
interface TelegramWebAppUser {
  id: number;
  first_name?: string;
  language_code?: string;
}

interface TelegramCloudStorage {
  setItem(key: string, value: string, cb?: (err: string | null, stored?: boolean) => void): void;
  getItems(keys: string[], cb: (err: string | null, values?: Record<string, string>) => void): void;
  removeItems(keys: string[], cb?: (err: string | null, removed?: boolean) => void): void;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramWebAppUser };
  version: string;
  platform: string;
  isFullscreen?: boolean;
  isVersionAtLeast(version: string): boolean;
  ready(): void;
  expand(): void;
  close(): void;
  requestFullscreen?(): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation(): void;
  disableClosingConfirmation(): void;
  setHeaderColor(color: string): void;
  setBackgroundColor(color: string): void;
  setBottomBarColor?(color: string): void;
  onEvent(event: string, cb: () => void): void;
  offEvent(event: string, cb: () => void): void;
  CloudStorage: TelegramCloudStorage;
  BackButton: {
    isVisible: boolean;
    show(): void;
    hide(): void;
    onClick(cb: () => void): void;
    offClick(cb: () => void): void;
  };
  HapticFeedback: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
  };
}

interface AdsgramResult {
  done: boolean;
  description?: string;
  state?: string;
  error?: boolean;
}

interface AdsgramController {
  show(): Promise<AdsgramResult>;
}

interface Window {
  Telegram?: { WebApp?: TelegramWebApp };
  Adsgram?: { init(opts: { blockId: string; debug?: boolean }): AdsgramController };
}
