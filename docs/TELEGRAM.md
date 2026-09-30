# Кубоскульптор в Telegram

Игра — Telegram Mini App: обычная статика (`dist/`), которую Telegram открывает во встроенном
WebView по HTTPS-адресу. Всё, что связано с Telegram, изолировано в `src/platform/TelegramPlatform.ts`;
остальной код работает через интерфейс `Platform`.

## Что сделано под Telegram

| Возможность             | Реализация                                                                                               |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| Определение окружения   | SDK (`telegram-web-app.js`) подгружается только если в URL есть `tgWebAppData`; иначе — `MockPlatform`   |
| Запуск                  | `WebApp.ready()` после загрузки меню, `expand()`, `disableVerticalSwipes()`, цвета шапки/фона            |
| Полный экран (опция)    | `VITE_TG_FULLSCREEN=1` — `requestFullscreen()` на Android/iOS; безопасные зоны — через CSS-переменные TG |
| Язык                    | `initDataUnsafe.user.language_code` (ru/en)                                                              |
| Сохранения              | `CloudStorage` (Bot API 6.9+), блоб режется на куски ≤ 3500 символов; резерв — `localStorage`            |
| Кнопка «назад»          | Telegram `BackButton` показывается на всех экранах, кроме главного меню                                  |
| Пауза                   | `activated`/`deactivated` (Bot API 8.0) + скрытие вкладки                                                |
| Защита от потери партии | `enableClosingConfirmation()` пока идёт уровень                                                          |
| Вибрация                | `HapticFeedback` (промах, победа, поражение); учитывается настройка «Вибрация»                           |
| Авторизация             | Telegram идентифицирует игрока сам, отдельный вход не нужен                                              |
| Реклама                 | [Adsgram](https://adsgram.ai) (необязательно), см. ниже                                                  |

## Реклама

В Telegram нет встроенной рекламы. Если заданы переменные сборки, используется Adsgram:

- `VITE_ADSGRAM_REWARDED_BLOCK_ID` — блок rewarded («Продолжить за рекламу» после проигрыша);
- `VITE_ADSGRAM_INTERSTITIAL_BLOCK_ID` — блок interstitial (между уровнями, не чаще раза в минуту).

Без них рекламы нет, а кнопка продолжения называется «Продолжить» и срабатывает бесплатно.

## Запуск по шагам

1. **Хостинг.** Нужен HTTPS. Проще всего GitHub Pages: в репозитории _Settings → Pages → Source:
   GitHub Actions_, затем пуш в `main` запускает `.github/workflows/deploy.yml`
   (адрес вида `https://<user>.github.io/<repo>/`). Подойдёт и любой другой статический хостинг:
   `npm run build` и выложить `dist/`.
2. **Бот.** В [@BotFather](https://t.me/BotFather): `/newbot` → получить токен.
3. **Mini App.** В @BotFather: `/newapp` (или _Bot Settings → Configure Mini App_) → указать адрес из шага 1.
   Для прямой ссылки `t.me/<bot>/<app>` — короткое имя приложения из `/newapp`.
4. **Кнопка меню и `/start`:**
   ```sh
   export TELEGRAM_BOT_TOKEN=...            # токен из шага 2
   export WEBAPP_URL=https://<host>/        # адрес из шага 1
   npm run bot -- --setup                   # кнопка «Play» в меню бота
   npm run bot                              # бот отвечает на сообщения кнопкой «Играть»
   ```
   Бот нужен только чтобы открывать игру из чата; если хватает `t.me/<bot>/<app>`, его можно не запускать.
5. **Проверка без публикации.** Тестовое окружение Telegram или туннель (`cloudflared`, `ngrok`) к
   `npm run dev`/`npm run preview` — адрес туннеля подставить в BotFather. Отладка на десктопе:
   Telegram Desktop → _Settings → Advanced → Experimental → Enable webview inspecting_.

## Локальная разработка

В обычном браузере SDK не подключается и работает `MockPlatform` — всё как раньше (`npm run dev`).
`?platform=mock` принудительно включает Mock даже внутри Telegram. e2e-тесты Telegram-режима
(`e2e/telegram.spec.ts`) подставляют фейковый `window.Telegram.WebApp`.

## Ограничения

- Прогресс по уровням в исходной игре ещё не сохраняется (это фаза 6 брифа) — в облако сейчас пишутся
  настройки; формат блоба `{ v, settings }` расширяется без изменения платформенного слоя.
- Проверка `initData` на сервере не делается: бэкенда нет. Если появятся лидерборды — валидировать
  подпись `initData` нужно на сервере.
