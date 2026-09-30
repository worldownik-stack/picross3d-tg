import './ui/styles.css';
import { installErrorHandlers } from './app/errors';
import { applyUiScale, lockPageGestures } from './app/viewport';
import { createPlatform } from './platform';
import { resolveLang, setLang, t } from './i18n';
import { loadContentIndex } from './app/content';
import { SETTINGS_KEY, SettingsStore } from './app/settings';
import { LevelStore } from './app/levels';
import { PROGRESS_KEY, ProgressStore } from './app/progress';
import { SaveStore } from './app/save';
import { Sound } from './audio/Sound';
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
  const save = new SaveStore((blob, flush) => platform.saveData(blob, flush));
  const progress = new ProgressStore(save);
  const [content, saved] = await Promise.all([
    loadContentIndex(),
    platform.loadData().catch(() => null),
    fontReady.catch(() => undefined),
  ]);
  save.load(saved);
  progress.load(save.get(PROGRESS_KEY));
  setBootProgress(0.8);

  const ui = document.getElementById('ui')!;
  const stage = document.getElementById('stage')!;
  stage.classList.add('hidden');
  const modalLayer = document.createElement('div');
  modalLayer.className = 'modal-layer';

  const settings = new SettingsStore();
  settings.loadSaved(save.get(SETTINGS_KEY));
  settings.subscribe((s) => save.set(SETTINGS_KEY, { ...s }, false));
  const sound = new Sound(settings);
  sound.installUnlock();
  platform.onPause(() => sound.setPaused(true));
  platform.onResume(() => sound.setPaused(false));
  // Тихий щелчок на кнопках и карточках интерфейса.
  ui.addEventListener('click', (e) => {
    if ((e.target as Element | null)?.closest('.btn, .card, .slot, .toggle-row')) sound.play('tap');
  });
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
  app = {
    platform,
    router,
    settings,
    content,
    stage,
    progress,
    sound,
    levels: new LevelStore(content),
  };

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
  // Музыка — после ready() (§9); заиграет с первым жестом, если включена.
  sound.startMusic();

  if (__DEBUG__ && new URLSearchParams(location.search).has('debug')) {
    const { installDebug } = await import('./debug/debug');
    installDebug(app);
  }
}

boot().catch((e: unknown) => {
  console.error('boot failed', e);
});
