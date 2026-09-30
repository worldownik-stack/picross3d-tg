import './ui/styles.css';
import { installErrorHandlers } from './app/errors';
import { applyUiScale, lockPageGestures } from './app/viewport';
import { createPlatform } from './platform';
import { resolveLang, setLang, t } from './i18n';
import { loadContentIndex } from './app/content';
import { SettingsStore, type Settings } from './app/settings';
import { LevelStore } from './app/levels';
import type { AppContext } from './app/context';
import { Router, type Screen, type ScreenId } from './ui/router';
import { setModalLayer, toast, topModal } from './ui/modal';
import { MenuScreen } from './ui/screens/MenuScreen';
import { PacksScreen } from './ui/screens/PacksScreen';
import { LevelsScreen } from './ui/screens/LevelsScreen';
import { GameScreen } from './ui/screens/GameScreen';
import { CollectionScreen } from './ui/screens/CollectionScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';

function setBootProgress(f: number): void {
  const bar = document.getElementById('boot-progress');
  if (bar) bar.style.width = `${Math.round(Math.max(0.05, Math.min(1, f)) * 100)}%`;
}

function hideBoot(): void {
  const boot = document.getElementById('boot');
  if (!boot) return;
  boot.classList.add('hidden');
  setTimeout(() => boot.remove(), 400);
}

async function boot(): Promise<void> {
  let errorToastShown = false;
  installErrorHandlers(() => {
    if (errorToastShown) return;
    errorToastShown = true;
    toast(t('error.generic'));
  });
  lockPageGestures();
  applyUiScale();
  window.addEventListener('resize', applyUiScale);
  setBootProgress(0.15);

  const platform = await createPlatform();
  setLang(resolveLang(platform.rawLang));
  setBootProgress(0.35);

  const fontReady = document.fonts
    ? Promise.all([
        document.fonts.load('800 32px Nunito'),
        document.fonts.load('800 32px Nunito', 'Ж'),
      ])
    : Promise.resolve();
  const [content] = await Promise.all([loadContentIndex(), fontReady.catch(() => undefined)]);
  setBootProgress(0.8);

  const ui = document.getElementById('ui')!;
  const stage = document.getElementById('stage')!;
  stage.classList.add('hidden');
  const modalLayer = document.createElement('div');
  modalLayer.className = 'modal-layer';

  const saved = await platform.loadData().catch(() => null);
  const settings = new SettingsStore(saved?.settings as Partial<Settings> | undefined);
  settings.subscribe((s) => void platform.saveData({ v: 1, settings: s }, false));
  const screens: Record<ScreenId, (app: AppContext) => Screen> = {
    menu: (a) => new MenuScreen(a),
    packs: (a) => new PacksScreen(a),
    levels: (a) => new LevelsScreen(a),
    game: (a) => new GameScreen(a),
    collection: (a) => new CollectionScreen(a),
    settings: (a) => new SettingsScreen(a),
  };
  // eslint-disable-next-line prefer-const
  let app: AppContext;
  const router = new Router(ui, (id) => screens[id](app));
  app = { platform, router, settings, content, stage, levels: new LevelStore(content) };

  ui.append(modalLayer);
  setModalLayer(modalLayer);
  // Модалки всегда поверх экранов.
  router.onChange((id) => {
    ui.append(modalLayer);
    // Системная кнопка «назад» Telegram: везде, кроме главного меню.
    platform.setBackButton?.(id !== 'menu', () => {
      const m = topModal();
      if (m && router.currentId !== 'game') m.close();
      else router.currentScreen?.back();
    });
  });

  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Escape' || e.repeat) return;
    const m = topModal();
    if (m && router.currentId !== 'game') {
      m.close();
      return;
    }
    router.currentScreen?.back();
  });

  await router.go('menu');
  setBootProgress(1);
  hideBoot();
  // Главное меню интерактивно — сообщаем платформе ровно один раз (п. 1.19.2).
  platform.loadingReady();

  if (__DEBUG__ && new URLSearchParams(location.search).has('debug')) {
    const { installDebug } = await import('./debug/debug');
    installDebug(app);
  }
}

boot().catch((e: unknown) => {
  console.error('boot failed', e);
});
