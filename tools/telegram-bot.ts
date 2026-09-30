/**
 * Бот-«запускалка» Mini App (без зависимостей, long polling).
 *
 *   TELEGRAM_BOT_TOKEN=... WEBAPP_URL=https://<host>/ npm run bot          # отвечать на /start
 *   TELEGRAM_BOT_TOKEN=... WEBAPP_URL=https://<host>/ npm run bot -- --setup # настроить меню бота и выйти
 *
 * WEBAPP_URL — HTTPS-адрес игры (например, GitHub Pages, см. docs/TELEGRAM.md).
 */
export {};

const token = process.env.TELEGRAM_BOT_TOKEN;
const webAppUrl = process.env.WEBAPP_URL;
if (!token || !webAppUrl) {
  console.error('Нужны переменные TELEGRAM_BOT_TOKEN и WEBAPP_URL');
  process.exit(1);
}

const api = async <T = unknown>(method: string, body: object = {}): Promise<T> => {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result: T; description?: string };
  if (!json.ok) throw new Error(`${method}: ${json.description ?? res.status}`);
  return json.result;
};

const TEXT = {
  ru: { play: '🎮 Играть', welcome: 'Кубоскульптор — объёмные японские кроссворды. Жми «Играть»!' },
  en: { play: '🎮 Play', welcome: 'Cube Sculptor — 3D picture logic puzzles. Tap “Play”!' },
};
const pick = (code?: string) => (code?.startsWith('ru') ? TEXT.ru : TEXT.en);

async function setup(): Promise<void> {
  await api('setChatMenuButton', {
    menu_button: { type: 'web_app', text: 'Play', web_app: { url: webAppUrl } },
  });
  await api('setMyCommands', { commands: [{ command: 'start', description: 'Play' }] });
  console.log('Меню бота настроено:', webAppUrl);
}

interface Update {
  update_id: number;
  message?: { chat: { id: number }; text?: string; from?: { language_code?: string } };
}

async function poll(): Promise<void> {
  let offset = 0;
  console.log('Бот запущен, жду сообщения…');
  for (;;) {
    try {
      const updates = await api<Update[]>('getUpdates', {
        offset,
        timeout: 30,
        allowed_updates: ['message'],
      });
      for (const u of updates) {
        offset = u.update_id + 1;
        const m = u.message;
        if (!m) continue;
        const tx = pick(m.from?.language_code);
        await api('sendMessage', {
          chat_id: m.chat.id,
          text: tx.welcome,
          reply_markup: { inline_keyboard: [[{ text: tx.play, web_app: { url: webAppUrl } }]] },
        });
      }
    } catch (e) {
      console.error(e);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

if (process.argv.includes('--setup')) await setup();
else await poll();
