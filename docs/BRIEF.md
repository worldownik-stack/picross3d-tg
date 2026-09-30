# Бриф для Claude: 3D-головоломка по механикам Picross 3D для Яндекс Игр

## 0. Роль и цель

Ты — ведущий разработчик и технический геймдизайнер. Сделай готовую к публикации на Яндекс Играх HTML5-игру: объёмный «японский кроссворд». Механики должны повторять Picross 3D (Nintendo DS, 2009), а архитектура — позволять позже добавить механики Picross 3D: Round 2. Работай автономно по фазам (§11). Останавливайся только в контрольных точках, помеченных ⛔.

Рабочее название — **«Кубоскульптор»** (en: *Cube Sculptor*). Финальное название выберет владелец.

### Правовые рамки

- Копируем только игровые правила: они не охраняются авторским правом.
- Нельзя использовать: слово «Picross», товарные знаки Nintendo/HAL Laboratory/Jupiter, их персонажей, графику, шрифты, звуки. Нельзя копировать интерфейс один-в-один, а также названия и фигуры уровней оригинала.
- Визуальный стиль свой — мастерская скульптора: игрок высекает статуэтку из блока, и после решения она «оживает» в цвете. Тёплые кремовые и древесные тона, кубы из светлого песчаника или гипса, помеченные кубы бирюзовые, промах — красная трещина. UI мягкий, округлый и дружелюбный.

---

## 1. Контекст и ограничения

- **Платформа:** Яндекс Игры. HTML5 в iframe, десктоп и мобильные (портрет и ландшафт), включая слабые Android.
- **Стек (решено, не менять):** TypeScript (strict), Vite, three.js. UI делается на DOM/CSS поверх canvas, без тяжёлых фреймворков. Ядро логики пишется на чистом TS и не зависит от three.js.
- **Рантайм полностью офлайн.** Никаких внешних запросов (CDN, веб-шрифты, аналитика, AI), кроме SDK Яндекса. Meshy используется только в пайплайне подготовки контента и никогда не вызывается из игры: п. 1.23 требований запрещает интерактивный ИИ.
- **Размер:** платформа ограничивает игру 100 МБ в распакованном виде (п. 1.21). Наш бюджет — не больше 40 МБ всего и не больше 4 МБ (gzip) до интерактивного главного меню.
- **Инструменты:** Node 20+, npm, Playwright (скриншоты, видео, e2e), Meshy MCP, веб-доступ к документации.
- **Документация.** Методы SDK и параметры Meshy не выдумывай — сверяйся с источниками:
  - требования: https://yandex.ru/dev/games/doc/ru/concepts/requirements
  - SDK: https://yandex.ru/dev/games/doc/ru/sdk/sdk-about
  - загрузка и геймплей: https://yandex.ru/dev/games/doc/ru/sdk/sdk-game-events
  - события паузы: https://yandex.ru/dev/games/doc/ru/sdk/sdk-events
  - реклама: https://yandex.ru/dev/games/doc/ru/sdk/sdk-adv
  - игрок и сохранения: https://yandex.ru/dev/games/doc/ru/sdk/sdk-player
  - локальный запуск: https://yandex.ru/dev/games/doc/ru/concepts/local-launch
  - Meshy Text-to-3D: https://docs.meshy.ai/en/api/text-to-3d (и описания инструментов MCP)

---

## 2. Правила головоломки (Round 1) — реализовать точно

1. **Поле** — прямоугольный блок X×Y×Z кубов, каждая ось независима. В контенте размер от 2 до 10 по оси, в движке жёсткого лимита нет (должно работать до 15).
2. **Решение** — подмножество кубов, то есть фигура. Цель — разбить все кубы, которые в фигуру не входят.
3. **Линия** — ряд кубов вдоль одной оси (X, Y или Z) при двух фиксированных других координатах. Всего линий Y·Z + X·Z + X·Y.
4. **Подсказка линии** — число *n*, равное количеству кубов фигуры в этой линии, плюс его тип:
   - обычное число: кубы фигуры в линии образуют одну непрерывную группу (или n = 0);
   - число в кружке: ровно 2 группы;
   - число в квадрате: 3 группы и больше.
   Подсказка может быть скрыта (пустая грань) — тогда она ничего не ограничивает.
5. **Где видна подсказка.** Подсказка линии вдоль оси A рисуется на гранях ±A **каждого** куба этой линии. Глядя на грань «в лоб», игрок видит число для линии, уходящей вглубь. Поэтому число остаётся видимым, когда внешние кубы уже сломаны.
6. **Инструменты:**
   - **Молоток** ломает куб. Если куб не входит в фигуру, он исчезает с анимацией разрушения. Если входит — это **промах**: куб остаётся, получает трещину и автоматически помечается кистью, а счётчик промахов растёт на 1.
   - **Кисть** ставит или снимает пометку «этот куб точно остаётся». Помеченный куб нельзя сломать: удар молотком даёт лёгкий «бонк» без штрафа. В Round 1 кисть не проверяется и не штрафуется.
   - **Протяжка.** Игрок зажимает палец или кнопку на кубе и ведёт вдоль линии — действие применяется ко всем кубам по пути. Ось фиксируется по первому переходу на соседний куб. Для молотка помеченные кубы пропускаются, а на первом промахе протяжка обрывается. Для кисти режим (ставить или снимать) определяется по первому кубу.
7. **Срезы** скрывают внешние слои, чтобы добраться до внутренних. Есть ползунки по X, Y и Z: ручки у рёбер блока и кнопки на мобильных. Одновременно активен срез только по одной оси: новый срез сбрасывает предыдущий. Скрытые слои не рендерятся и не кликаются.
8. **Поражение** — 5 промахов. Игрок выбирает «Начать заново» или «Продолжить за рекламу» (rewarded: минус 2 промаха, один раз за попытку).
9. **Победа** наступает, как только сломан последний «лишний» куб; помечать оставшиеся не обязательно. Ввод блокируется, оставшиеся кубы волной снизу вверх окрашиваются в цвета фигуры. Затем фигура «оживает» — простая процедурная анимация из данных уровня (`bob`, `spin`, `hop`, `wobble`) — и показывается её название.
10. **Время и звёзды.** Таймер считает вверх и стоит на паузе, при скрытой вкладке и во время рекламы. У уровня есть `targetTime`. Звёзды = 3 − [промахов > 0] − [время > targetTime], минимум 1. Жёсткого лимита времени в основном режиме нет — это сознательное отступление от оригинала ради казуальной аудитории, оно выносится в конфиг.
11. **Гарантия качества:** каждый уровень решается чистой логикой без угадывания, и решение единственно (см. §5).

### Задел под Round 2 (в MVP не реализовывать, но архитектура не должна мешать)

- У фигуры 2 цвета кубов. Подсказка линии — одно или два числа своего цвета («двойные числа»). У каждого числа свой тип (обычное, кружок, квадрат), считающийся по кубам его цвета.
- Кисть красит в один из двух цветов. Неверный цвет — промах. Для победы все оставшиеся кубы должны быть окрашены правильно.
- Флажки-карандаш — непроверяемые пометки-предположения. «Бомба» — вспомогательное действие, убирающее все лишние кубы линии.
- В оригинале часть кубов после решения превращается в скруглённые или скошенные формы. У нас у ячейки решения будет опциональный `shapeId` для финального рендера.
- **Что это значит для архитектуры:**
  - решение хранится как массив классов ячеек (0 — пусто);
  - подсказка — список частей `{color, count, groups}`;
  - у уровня есть поле `ruleset: 'classic' | 'dual'`;
  - линейный решатель подключается по ruleset;
  - атлас глифов поддерживает цветные и двойные числа;
  - кисть хранит цвет пометки.

---

## 3. Управление и UX

**Десктоп**

- ЛКМ по кубу — текущий инструмент, ПКМ по кубу — кисть (быстрый доступ). Протяжка работает для обеих кнопок.
- Перетаскивание по пустому месту или средней кнопкой — вращение, колесо — зум.
- Клавиши определяются по `event.code`, чтобы не зависеть от раскладки (п. 1.6.2.4):
  - `Digit1`/`Digit2` — молоток и кисть;
  - удерживать `Space` — временно кисть;
  - `WASD` и стрелки — вращение;
  - `KeyR` — сменить ось среза, `KeyQ`/`KeyE` — сдвинуть срез;
  - `Escape` — пауза.
  Системные сочетания (Ctrl/Cmd+…, F5, F11) не используем (п. 1.6.2.6).
- Ховер подсвечивает куб под курсором и слегка — его три линии (подсветку линий можно отключить в настройках).

**Мобильные (п. 1.6.1.5 — только жесты)**

- Тап по кубу — текущий инструмент. Крупный переключатель «Молоток / Кисть» у большого пальца и кнопка «удерживай — кисть».
- Протяжка, начатая на кубе, — действие по линии. Начатая на пустом месте — вращение. Двумя пальцами — вращение и pinch-зум.
- Срезы — крупные ручки (не меньше 48 px) и кнопки.
- Лонгтап не выделяет текст и не открывает меню (п. 1.6.1.8). Нет прокрутки страницы и pull-to-refresh (п. 1.10.2). Для этого: `touch-action: none`, `overscroll-behavior: none`, `user-select: none`, `-webkit-touch-callout: none`, `preventDefault` на `contextmenu`.
- Вибрация `navigator.vibrate` на промахе, если доступна (отключается в настройках).

**Камера и адаптив**

- Орбита вокруг центра блока, pitch ограничен диапазоном −60°…+80°.
- Автокадрирование при смене размера и ориентации с запасом под UI. Есть кнопка «Сбросить вид».
- Корректная работа при ресайзе и повороте (п. 1.8, 1.10). UI масштабируется от короткой стороны экрана, тач-цели не меньше 44 px.

---

## 4. Мета-игра и экраны

- **Поток экранов:** загрузка (своя, лёгкая) → главное меню (Играть / Коллекция / Настройки) → выбор набора → выбор уровня → уровень → итог → следующий уровень.
- **Контент:** обучение из 5 уровней и 10 тематических наборов по 10 уровней (см. Приложение А). Внутри набора уровни открываются последовательно. Следующий набор открывается после 7 решённых в предыдущем.
- **Обучение** — 5 коротких интерактивных уровней с указателем-рукой и одной строкой текста на шаг:
  1. сломать куб, ноль и полная линия;
  2. обычные числа;
  3. кисть;
  4. вращение и срезы;
  5. кружки и квадраты.
- **Коллекция:** решённые фигуры на полках по наборам, нерешённые — силуэт «?». По тапу фигура крупно вращается.
- **Итог уровня:** звёзды, время, промахи, кнопки «Далее», «Переиграть», «В коллекцию».
- **Пауза** (Esc или кнопка): «Продолжить», «Заново», «В меню».
- **Подсказка (rewarded).** Решатель находит следующий логический шаг от текущего состояния поля и применяет его к одной линии: подсвечивает её и анимирует. Звёзды за подсказку не снимаются.
- **Настройки:** музыка, звуки, вибрация, подсветка линий, «затемнять выполненные линии» (линия считается выполненной, когда в ней не осталось непомеченных кубов и число помеченных равно подсказке — т.е. только по знаниям игрока), сброс прогресса с подтверждением.

---

## 5. Уровни: формат, решатель, генератор

### 5.1 Формат

Один JSON на набор, грузится лениво:

```json
{
  "id": "sea_04",
  "pack": "sea",
  "title": { "ru": "Кит", "en": "Whale" },
  "size": [8, 5, 6],
  "ruleset": "classic",
  "cells": "<RLE→base64: индекс цвета палитры на ячейку, 0 = пусто>",
  "palette": ["#3b6fb6", "#f2f2f2", "#222831"],
  "hidden": { "x": "<bitset>", "y": "<bitset>", "z": "<bitset>" },
  "difficulty": 3,
  "targetTime": 240,
  "anim": "bob",
  "reveal": "models/sea_04.glb"
}
```

- Подсказки в файле **не хранятся**: они вычисляются из `cells` при загрузке, поэтому рассинхрона не будет.
- Индекс ячейки: `i = x + X*(y + Y*z)`.
- В `classic` решение — это `cells > 0`, а индексы палитры задают только финальную окраску. Для `dual` позже добавится отдельное поле классов ячеек.

### 5.2 Линейный решатель

Ядро на чистом TS.

- Состояния ячейки: `UNKNOWN`, `KEEP`, `BREAK`.
- Для линии длины n ≤ 15 и подсказки кэшируется список всех битовых масок, удовлетворяющих подсказке: `popcount = count`, число серий 1, 2 или ≥ 3. Для n = 0 это пустая маска. Скрытая подсказка допускает любые маски.
- **Шаг по линии:** оставить маски, совместимые с уже известными ячейками. Если масок не осталось — противоречие. Ячейка, где все маски дают 1, становится `KEEP`; где все дают 0 — `BREAK`.
- **Пропагация:** очередь «грязных» линий по трём осям, пока не наступит неподвижная точка.
- Уровень **решаем логикой**, если пропагация с пустого состояния определяет все ячейки. Это же гарантирует единственность решения.
- Отдельно нужен `countSolutions(limit = 2)` — перебор с возвратом и пропагацией, для тестов и отладки.
- **Метрики сложности:** число раундов пропагации, число шагов, где продвигается ровно одна линия, доля скрытых подсказок, размер поля, доля кружков и квадратов среди видимых подсказок. Из них выводится `difficulty` 1–5 и `targetTime`. Время калибруется прогонами бота: примерно коэффициент × число действий.

### 5.3 Прореживание подсказок

- Старт — все подсказки видимы.
- В детерминированном случайном порядке (seed = id уровня) пробуем скрыть по одной подсказке. Скрытие остаётся, только если уровень по-прежнему решается логикой.
- Остановиться на целевой доле скрытых, заданной для набора (растёт от набора к набору).
- В ранних наборах в первую очередь скрываются кружки и квадраты, чтобы вводить их постепенно: кружки — с набора 2, квадраты — с набора 3.

### 5.4 Бот-проверка

Для каждого уровня бот проходит его через игровой API, а не через решатель напрямую: ломает все `BREAK` и не делает ни одного промаха. Прогон входит в `npm test`.

### 5.5 Источники фигур

1. **Вручную** — обучение и самые простые уровни. Фигуры задаются маленьким DSL на TS (`box`, `sphere`, `cylinder`, `mirrorX`, `remove`, `paint`), результат — `cells`.
2. **Meshy → воксели** — основной контент, см. §6.

Все уровни собирает скрипт `npm run levels` из `content/manifest.json` в `public/levels/*.json`. Сборка детерминированная.

---

## 6. Пайплайн ассетов через Meshy MCP

### 6.1 Генерация (только при подготовке контента)

1. Preview через `meshy_text_to_3d`: `ai_model: "latest"`, `topology: "triangle"`, `target_polycount: 8000`, `should_remesh: true`, `target_formats: ["glb"]`. Промт = стилевой префикс + описание объекта из Приложения А. Не длиннее 800 символов, на английском.
2. Refine через `meshy_text_to_3d_refine`: `enable_pbr: false`, `texture_prompt` из Приложения А, `remove_lighting: true`, если выбранная модель это поддерживает.
3. GLB сохраняется в `content/meshy/raw/<id>.glb`, превью Meshy — рядом. Task id, параметры и статус записываются в `content/manifest.json`. Пайплайн возобновляемый: то, что уже сгенерировано, повторно не генерируется.

⛔ **Контрольная точка (пилот).** Сначала сгенерируй 3 модели разных типов (например, `food_01`, `pet_01`, `tr_05`), превратив их в воксели и уровни. Покажи скриншоты и расход кредитов. Массовая генерация — только после «ок» владельца.

### 6.2 Вокселизация

`tools/voxelize.ts`, Node, `@gltf-transform/core` и собственная геометрия.

- **Нормализация:** поставить на пол, отцентрировать, повернуть по `rotation` из manifest так, чтобы «лицо» объекта смотрело в +Z.
- **Сетка:** вписать в сетку набора. Длинная сторона равна `maxSize` уровня, пропорции сохраняются, короткая сторона не меньше 2.
- **Заполнение:** в каждой ячейке 4×4×4 выборки «точка внутри меша». Проверка — голосованием лучей по трём осям, чтобы выдерживать дыры в меше. Ячейка заполнена, если доля попаданий ≥ `threshold` (по умолчанию 0.4, можно переопределить в manifest).
- **Цвет:** сэмплировать базовую текстуру в ближайших точках поверхности (UV и барицентрические координаты) и усреднить. Внутренние ячейки получают цвет ближайшей поверхностной. Затем привести цвета к общей палитре игры (≈32 гармоничных цвета) и оставить не больше 6 цветов на фигуру.
- **Чистка:** убрать висящие одиночные воксели, заполнить дыры в одну ячейку. После этого применяются ручные правки из manifest (боксы `add` и `remove`).
- Дальше уровень проходит §5.3 и §5.2.

### 6.3 Контроль узнаваемости

- `tools/render-thumbs.ts` через Playwright рендерит каждую фигуру игровым рендером с трёх ракурсов в `content/review/<id>.png`.
- Картинки ты **смотришь сам**. Если фигура не узнаётся в своём размере, поправь поворот, порог или размер, добавь ручные правки или перегенерируй с упрощённым промтом.
- Не больше двух перегенераций на объект. Дальше объект заменяется из резерва (Приложение А.4).

### 6.4 «Оживление» гладкой моделью (флаг `revealModel`, опционально)

- После решения воксельная фигура рассыпается, а на её месте собирается гладкая модель Meshy (кроссфейд и масштаб) и вращается на постаменте.
- **Оптимизация** через gltf-transform: упростить до 3000 треугольников и меньше, текстура 512 px в WebP или KTX2, meshopt-сжатие. Итог — не больше 250 КБ на модель, загрузка лениво во время прохождения уровня.
- Если гладкие модели не вяжутся по стилю с вокселями, оставь флаг выключенным и напиши об этом в отчёте.

### 6.5 Прочие 3D-ассеты

Поворотный стол, молоток, кисть, постамент, фон меню — см. Приложение А.3.

---

## 7. Рендер и производительность

- **Один `InstancedMesh`** на все кубы (до 1000 инстансов) с `BoxGeometry`. Атрибуты инстанса:
  - `aClue` (vec3) — индекс глифа для осей X, Y, Z;
  - `aState` — флаги: помечен, треснут, ховер, подсветка линии;
  - `aColor` — цвет фигуры для раскрытия;
  - `aReveal` — 0..1.
- **Шейдер** (`onBeforeCompile` к Lambert/Standard или свой `ShaderMaterial`):
  - по нормали грани выбирается ось, по ней — глиф из атласа;
  - фаска рисуется в шейдере (затемнение и осветление к краям грани по uv), без тяжёлой геометрии;
  - глифы на гранях ±X и ±Z стоят вертикально, на ±Y — поворачиваются к камере с шагом 90° (uniform от азимута камеры).
- **Атлас глифов** генерируется в рантайме через Canvas2D нашим шрифтом: обычные 0–15, в кружке 2–15, в квадрате 3–15, пустой глиф, плюс цветные и двойные варианты под Round 2. С мипмапами и анизотропией. Цифры должны читаться на 10×10×10 на экране телефона.
- **Пикинг** — не `Raycaster` по мешу, а DDA-обход сетки (Amanatides–Woo) с учётом сломанных и скрытых срезом ячеек. Результат — ячейка и нормаль грани.
- **Эффекты:**
  - пул частиц разрушения на один draw call;
  - при промахе лёгкая тряска и красная трещина;
  - при победе волна окраски.
  Освещение — hemisphere + directional, без реальных теней; под блоком фейковая тень-блоб.
- **Бюджет:**
  - 60 FPS на десктопе и средних Android;
  - не больше 30 draw calls на уровне;
  - DPR ≤ 2 (на мобильных ≤ 1.75);
  - никаких аллокаций в кадре;
  - рендер по требованию: когда ничего не меняется, кадр не перерисовывается.
- **Шрифт** — локальный woff2 с кириллицей (subset).

---

## 8. Интеграция Яндекс Игр

Каждый пункт закрывается тестом или ручной проверкой через sdk-dev-proxy.

- **Слой платформы.** Модуль `platform/` с интерфейсом `Platform` и двумя реализациями — `YandexPlatform` и `MockPlatform`. Игра никогда не обращается к `ysdk` напрямую.
- **Подключение SDK.** `<script src="/sdk.js">` загружается до `YaGames.init()`. Если SDK недоступен (локально), используется Mock.
- **`ysdk.features.LoadingAPI?.ready()`** — ровно один раз, когда главное меню стало интерактивным (п. 1.19.2).
- **`GameplayAPI.start()` / `stop()`** (п. 1.19.3):
  - start — уровень стал интерактивным, после паузы, после рекламы;
  - stop — пауза, меню, итог уровня, реклама, скрытие вкладки.
  Обёртка не допускает двух `start` или двух `stop` подряд.
- **Пауза.** `ysdk.on('game_api_pause' | 'game_api_resume')` и `visibilitychange` останавливают и возобновляют таймер и звук (п. 1.3, 4.7).
- **Реклама:**
  - полноэкранная — только в логических паузах: кнопка «Далее» на итоге уровня и возврат в меню (п. 4.4). Частоту регулирует платформа, у нас дополнительный кулдаун 60 с. Сами не вызываем её при запуске игры, до первого уровня. На время показа звук и таймер на паузе (п. 4.7);
  - rewarded — подсказка и «Продолжить» после 5 промахов. Награда выдаётся только в `onRewarded`;
  - sticky-баннер включается в консоли. Игра должна корректно ужиматься при изменении доступной области.
- **Сохранения:**
  - `player.getData` / `setData` плюс зеркало в localStorage;
  - схема данных с версией и миграциями;
  - при загрузке данные сливаются: по каждому уровню берутся максимум звёзд и лучшее время;
  - `setData` не чаще раза в 10 с (лимит 100 запросов за 5 минут), `flush = true` на итоге уровня;
  - незавершённый уровень (битсеты сломанных и помеченных кубов, промахи, время) сохраняется и восстанавливается после перезагрузки (п. 1.9);
  - объём данных сильно меньше 200 КБ.
- **Авторизация** — только по кнопке «Войти, чтобы сохранить прогресс на всех устройствах» (п. 1.2). Гость играет без ограничений.
- **Язык:** `ysdk.environment.i18n.lang` → ru или en (опционально tr), всё остальное → en (п. 2.14, 8.2.3). Все строки лежат в `i18n/*.json`, в коде нет ни одной строки UI.
- **Запреты:** никаких внешних ссылок (п. 8.4.2) и сторонних платежей (п. 1.4).
- **Локальный запуск с SDK:**
  - `npx @yandex-games/sdk-dev-proxy -p dist --dev-mode=true` — моки рекламы, авторизации и данных;
  - с черновиком в консоли: `--app-id=<id>`.
- **Сборка:**
  - `vite build` с `base: './'`, `index.html` в корне архива;
  - `npm run pack` собирает `build.zip` и печатает отчёт о размере;
  - сборка падает, если бюджет из §1 превышен.

---

## 9. Звук

- Web Audio.
- SFX синтезируются процедурно, с вариациями высоты:
  - удар — короткий «тук» с шумом;
  - кисть — мягкий «шшк»;
  - промах — глухой низкий звук;
  - победа — короткий мажорный аккорд.
- Музыка — 1–2 спокойных лупа (CC0 или от владельца), OGG, не больше 1 МБ каждый. Грузится после `ready()`.
- `AudioContext` разблокируется по первому жесту. Громкость музыки и звуков регулируется раздельно.

---

## 10. Качество и тесты

- **Vitest:** решатель (известные головоломки, противоречия, `countSolutions` на малых полях), прореживание, сериализация уровней и сохранений, миграции.
- **Playwright e2e** на вьюпортах 390×844, 844×390 и 1366×768:
  - нет ошибок в консоли, `ready()` вызван;
  - бот проходит обучение через debug-API;
  - пауза и возврат работают;
  - перезагрузка посреди уровня восстанавливает состояние;
  - страница не прокручивается.
- **Скриншоты** каждого экрана в обеих ориентациях. Ты сам их просматриваешь и исправляешь дефекты: обрезанный UI, наложения, нечитаемые цифры.
- **Видео прохождения** (запись Playwright) — на контрольных точках.
- **`?debug=1`** работает только в dev-сборке: FPS, выбор любого уровня, показ решения, шаг решателя, выдача звёзд. Из prod-сборки debug вырезается.
- **Ошибки.** Глобальный обработчик ошибок; ни одного необработанного исключения (п. 1.14).

---

## 11. Порядок работы

Каждая фаза заканчивается так: тесты зелёные, prod-сборка собирается, сделаны скриншоты, а в `PROGRESS.md` записано, что сделано, что дальше и какие есть открытые вопросы. Решения с альтернативами фиксируются в `DECISIONS.md`. Один коммит на фазу.

| Фаза | Содержание | Результат |
|---|---|---|
| 0. Каркас | Vite+TS, структура папок, ESLint/Prettier, Vitest, Playwright, `MockPlatform`, i18n, пустые экраны | запускается, тесты проходят |
| 1. Ядро | модель поля, правила, решатель, прореживание, DSL, 5 обучающих уровней и 5 тестовых 10×10×10 | 100 % покрытие решателя тестами |
| 2. Играбельный прототип | рендер, атлас, пикинг, камера, молоток/кисть/протяжка, срезы, промахи, победа | ⛔ видео и скриншоты десктопа и телефона |
| 3. Пилот Meshy | 3 модели → воксели → уровни | ⛔ отчёт о качестве и кредитах, ждать «ок» |
| 4. Контент | всё Приложение А, ревью миниатюр, баланс сложности и `targetTime` | 105 уровней, бот проходит все |
| 5. Мета и полировка | меню, наборы, коллекция, обучение, звук, эффекты, настройки, раскрытие фигуры | вертикальный срез качества |
| 6. Яндекс | SDK, реклама, сохранения, авторизация, язык, пауза; чек-лист §8 через sdk-dev-proxy | все пункты §8 закрыты |
| 7. Релиз-кандидат | размер и FPS, промо (иконка 512×512, обложка 800×470, скриншоты — рендер из игры; размеры сверить в консоли), описание для каталога ru/en, `build.zip` | ⛔ передать владельцу |

**После релиза (только по запросу владельца):** Round 2 (два цвета, флажки, бомба), режимы «Один шанс» и «На время», ежедневная головоломка, лидерборд по звёздам, покупка «Без рекламы» через `ysdk.getPayments()`.

---

## 12. Правила работы

- Не спрашивай то, что уже решено здесь. Если что-то неоднозначно, выбери разумный вариант, запиши его в `DECISIONS.md` и продолжай.
- Кредиты Meshy расходуются только после ⛔ пилота. Каждая генерация учитывается в manifest.
- Проверяй свою работу сам: скриншоты, видео, прохождение ботом, чтение документации.
- Код ядра — чистые функции с тестами. Рендер и UI зависят от ядра, а не наоборот.

---

# Приложение А. Ассеты и промты для Meshy MCP

## А.1 Стиль моделей-головоломок

Модели превращаются в воксельную сетку не больше 10 по стороне, поэтому нужны:

- один объект, без подставки, земли и фона;
- нейтральная поза, объект смотрит вперёд;
- толстые цельные формы и минимум тонких деталей;
- крупные однотонные цветовые зоны;
- никаких надписей, логотипов, реальных брендов и чужих персонажей.

**Шаблон промта для preview** (`{OBJECT}` — из таблиц ниже):

```
Cute stylized toy figurine of {OBJECT}. Single object, centered, facing forward, no base, no ground, no background. Chunky simplified rounded proportions, thick solid parts, bold readable silhouette, no thin or tiny details, closed solid mesh. No text, no logos.
```

**Шаблон texture_prompt** (`{COLORS}` — из таблиц ниже):

```
Flat hand-painted toy colors: {COLORS}. Large clean areas of solid color, bright friendly palette, no baked lighting, no shadows, no gradients, no fine patterns, no text, no logos.
```

## А.2 Уровни (10 наборов × 10) и сетка

Обучение (5 уровней: ступенька, буква «Т», стул, стол, домик) делается вручную через DSL, без Meshy, на сетке 3–5.

### Набор 1 — «Еда», сетка 5–6

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| food_01 | Яблоко | a round apple with a short stem and one leaf | red apple, brown stem, green leaf |
| food_02 | Гриб | a chubby mushroom with a wide dome cap and a thick short stem | red cap, cream stem |
| food_03 | Морковка | a carrot lying horizontally with a leafy top | orange carrot, green leaves |
| food_04 | Арбуз | a thick triangular watermelon slice standing upright | red flesh, white stripe, green rind |
| food_05 | Мороженое | an ice cream cone with one big round scoop | tan waffle cone, pink scoop |
| food_06 | Кекс | a cupcake with a tall swirl of frosting and a cherry on top | brown cup, white frosting, red cherry |
| food_07 | Пончик | a thick donut ring lying flat | tan dough, pink glaze on top |
| food_08 | Сыр | a thick wedge of cheese with a few big round holes | yellow cheese |
| food_09 | Бургер | a tall hamburger with bun, patty, cheese and lettuce layers | tan bun, brown patty, yellow cheese, green lettuce |
| food_10 | Груша | a pear with a short stem | yellow-green pear, brown stem |

### Набор 2 — «Дом», сетка 6

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| home_01 | Кружка | a coffee mug with a big round handle | blue mug, white inside |
| home_02 | Чайник | a round teapot with a spout, a handle and a lid knob | light blue teapot, white lid |
| home_03 | Лампа | a table lamp with a cone lampshade on a round base | yellow shade, grey base |
| home_04 | Кресло | a cozy armchair with thick armrests | red fabric, brown legs |
| home_05 | Будильник | a round twin-bell alarm clock on two little legs | red body, white clock face, silver bells |
| home_06 | Зонтик | an open umbrella with a curved handle | red and white canopy, brown handle |
| home_07 | Лейка | a watering can with a long spout | green can |
| home_08 | Лампочка | a classic light bulb standing upright | pale yellow glass, grey screw base |
| home_09 | Домик | a small house with a pitched roof and a chimney | white walls, red roof, brown door, blue windows |
| home_10 | Сапог | a single rubber rain boot | yellow boot, dark sole |

### Набор 3 — «Природа», сетка 6–7

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| nat_01 | Ёлка | a cone-shaped fir tree with a short trunk | dark green tree, brown trunk |
| nat_02 | Дерево | a round leafy tree with a thick trunk | light green crown, brown trunk |
| nat_03 | Кактус | a saguaro cactus with two arms in a clay pot | green cactus, terracotta pot |
| nat_04 | Тюльпан | a tulip flower in a small pot | red petals, green stem and leaves, terracotta pot |
| nat_05 | Подсолнух | a sunflower with a big round flower head facing forward | yellow petals, brown center, green stem |
| nat_06 | Снеговик | a snowman of three snowballs with a carrot nose and a bucket hat | white snow, orange nose, black hat |
| nat_07 | Радуга | a thick rainbow arch standing on two small clouds | red, orange, yellow, green, blue bands, white clouds |
| nat_08 | Вулкан | a cone volcano with lava at the top | brown rock, orange lava |
| nat_09 | Жёлудь | an acorn with a textured cap and a tiny stem | light brown nut, dark brown cap |
| nat_10 | Гора | a mountain with a snowy peak | grey rock, white snow cap, green base |

### Набор 4 — «Ферма и питомцы», сетка 7

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| pet_01 | Кот | a sitting cat with pointy ears and a tail curled around its paws | orange fur, white muzzle and belly |
| pet_02 | Щенок | a sitting puppy with floppy ears | beige fur, brown ears, black nose |
| pet_03 | Кролик | a sitting bunny with tall upright ears | white fur, pink inner ears |
| pet_04 | Свинка | a round pig standing on four short legs, side view | pink pig, darker pink snout |
| pet_05 | Утка | a standing duck, side profile | white body, orange beak and feet |
| pet_06 | Цыплёнок | a round fluffy chick | yellow chick, orange beak |
| pet_07 | Овечка | a fluffy sheep on four short legs | white wool, dark grey face and legs |
| pet_08 | Корова | a cow standing on four legs with small horns | white with black patches, pink muzzle |
| pet_09 | Улитка | a snail with a big spiral shell | brown shell, light green body |
| pet_10 | Черепаха | a walking turtle with a domed shell | green shell, light green skin |

### Набор 5 — «Море», сетка 7–8

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| sea_01 | Кит | a chubby whale with a water spout | blue whale, light belly, white spout |
| sea_02 | Рыбка | a round tropical fish with big fins | orange fish, white stripes |
| sea_03 | Осьминог | an octopus with a round head and curled tentacles | purple octopus |
| sea_04 | Краб | a crab with two big claws raised | red crab |
| sea_05 | Морская звезда | a thick five-armed starfish | orange starfish |
| sea_06 | Медуза | a jellyfish with a dome and wavy tentacles | pink jellyfish |
| sea_07 | Морской конёк | a seahorse with a curled tail, side profile | yellow seahorse |
| sea_08 | Акула | a friendly shark, side profile | grey shark, white belly |
| sea_09 | Пингвин | a standing penguin | black back, white belly, orange beak and feet |
| sea_10 | Дельфин | a jumping dolphin, side profile | light blue-grey dolphin |

### Набор 6 — «Транспорт», сетка 8

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| tr_01 | Машинка | a small cartoon car | red body, blue windows, black wheels |
| tr_02 | Автобус | a city bus | yellow bus, blue windows, black wheels |
| tr_03 | Пожарная машина | a fire truck with a ladder on top | red truck, silver ladder, black wheels |
| tr_04 | Паровоз | a steam locomotive with a big chimney | black and red locomotive, gold trim |
| tr_05 | Самолёт | a propeller airplane | white plane, blue stripe, red propeller |
| tr_06 | Вертолёт | a helicopter with a top rotor | orange helicopter, blue windows, grey rotor |
| tr_07 | Парусник | a sailboat with one big sail | brown hull, white sail |
| tr_08 | Подлодка | a submarine with a periscope | yellow submarine, round blue windows |
| tr_09 | Трактор | a farm tractor with big rear wheels | green tractor, yellow wheels |
| tr_10 | Воздушный шар | a hot air balloon with a basket | red and yellow balloon, brown basket |

### Набор 7 — «Игрушки и музыка», сетка 8–9

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| toy_01 | Гитара | an acoustic guitar standing upright | orange-brown body, dark neck, black sound hole |
| toy_02 | Барабан | a snare drum with two drumsticks on top | red drum, white top, tan sticks |
| toy_03 | Труба | a trumpet, side view | gold trumpet |
| toy_04 | Рояль | a small grand piano with an open lid | black piano, white keys |
| toy_05 | Геймпад | a generic game controller without any brand | dark grey controller, colored buttons |
| toy_06 | Ладья | a chess rook | white chess piece |
| toy_07 | Конь | a chess knight | black chess piece |
| toy_08 | Юла | a spinning top | red and yellow stripes |
| toy_09 | Мишка | a sitting teddy bear | light brown fur, darker muzzle |
| toy_10 | Лошадка-качалка | a rocking horse | white horse, red saddle, brown rockers |

### Набор 8 — «Мастерская», сетка 9

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| ws_01 | Наковальня | an anvil | dark grey metal |
| ws_02 | Магнит | a horseshoe magnet | red magnet, silver tips |
| ws_03 | Ящик для инструментов | a toolbox with a handle | red box, silver handle |
| ws_04 | Молоток | a claw hammer lying flat | grey head, brown handle |
| ws_05 | Гаечный ключ | a wrench lying flat | silver metal |
| ws_06 | Банка краски | a paint can with a brush sticking out | blue paint, silver can, brown brush |
| ws_07 | Топор в пне | an axe stuck in a tree stump | brown stump, grey axe head, tan handle |
| ws_08 | Фонарь | an old lantern with a handle on top | black frame, yellow glowing glass |
| ws_09 | Замок | a padlock | gold body, silver shackle |
| ws_10 | Тачка | a wheelbarrow with one wheel | green tub, black wheel, brown handles |

### Набор 9 — «Сказки и праздники», сетка 9–10

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| fx_01 | Башня замка | a castle tower with battlements and a small flag | grey stone, red flag, blue roof |
| fx_02 | Дракончик | a chubby friendly baby dragon sitting | green dragon, yellow belly, small wings |
| fx_03 | Сундук | an open treasure chest full of gold coins | brown wood, gold coins, metal bands |
| fx_04 | Корона | a royal crown with gems | gold crown, red and blue gems |
| fx_05 | Зелье | a round potion bottle with a cork | purple liquid, clear glass, brown cork |
| fx_06 | Шляпа волшебника | a tall pointed wizard hat with a wide brim | dark blue hat, yellow band |
| fx_07 | Тыква-фонарь | a carved pumpkin lantern | orange pumpkin, green stem, dark carved face |
| fx_08 | Подарок | a gift box with a big bow on top | red box, yellow ribbon |
| fx_09 | Торт | a two-tier birthday cake with candles | pink cake, white cream, colorful candles |
| fx_10 | Привидение | a cute floating ghost | white ghost, black eyes |

### Набор 10 — «Космос и наука», сетка 10

| id | Название | {OBJECT} | {COLORS} |
|---|---|---|---|
| sp_01 | Ракета | a classic rocket with three fins | white body, red nose and fins, blue window |
| sp_02 | НЛО | a flying saucer with a glass dome | silver saucer, light blue dome, yellow lights |
| sp_03 | Планета с кольцом | a planet with a wide tilted ring | orange planet, beige ring |
| sp_04 | Шлем космонавта | a space helmet with a large visor | white helmet, dark gold visor |
| sp_05 | Спутник | a satellite with two solar panels | silver body, blue panels |
| sp_06 | Робот | a boxy friendly robot standing | light grey robot, blue eyes, red antenna |
| sp_07 | Микроскоп | a microscope | white and black microscope |
| sp_08 | Телескоп | a telescope on a tripod | blue tube, brown tripod |
| sp_09 | Колба | a round-bottom flask with liquid | clear glass, green liquid |
| sp_10 | Луноход | a six-wheeled moon rover | silver body, gold foil, black wheels |

## А.3 Прочие 3D-ассеты

Шаблон А.1 здесь не используется — промты целиком. Для всех: `enable_pbr: false`, после скачивания оптимизация по §6.4.

| id | Назначение | Полигоны | preview prompt | texture_prompt |
|---|---|---|---|---|
| prop_turntable | подиум под блоком на уровне | 1500 | A low wide round wooden sculptor's turntable pedestal, simple stylized game prop, clean shapes, no text | warm light wood, darker wood rim, flat stylized colors, no baked lighting |
| prop_hammer | молоток, анимация удара у курсора | 1500 | A chunky cartoon mallet hammer, stylized game prop, thick handle, rounded head, no text | light wood handle, grey steel head, flat stylized colors, no baked lighting |
| prop_brush | кисть, анимация пометки | 1500 | A chunky cartoon paintbrush, stylized game prop, thick wooden handle, round bristles, no text | light wood handle, silver ferrule, teal paint on bristles, flat stylized colors |
| prop_plinth | постамент в коллекции | 800 | A small square display plinth for a museum figurine, simple stylized game prop, beveled edges | cream marble, flat stylized colors, no baked lighting |
| env_workshop | фон главного меню (опционально, ≤ 1,5 МБ после сжатия) | 15000 | A cozy low-poly sculptor's workshop corner diorama: wooden workbench, shelves with small figurines, window with warm light, stylized game environment, no characters, no text | warm wood, cream walls, soft pastel accents, flat stylized colors, no baked lighting |

Если фон меню не получится или окажется тяжёлым, замени его процедурной сценой: градиент и медленно парящие кубы.

## А.4 Резерв на замену неудачных объектов

`a strawberry` · `a pair of cherries` · `a slice of layered cake` · `a lighthouse` · `an anchor` · `a scallop seashell` · `a windmill` · `a unicorn standing` · `a magic oil lamp` · `a bell` · `a trophy cup` · `a cute owl` · `a rubber duck` · `a toy train wagon` · `a mailbox`

Цвета для резерва подбери сам в том же стиле. Для каждой замены запиши в manifest причину (`replacedBecause`).
