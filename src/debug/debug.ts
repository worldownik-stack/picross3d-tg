import { Vector3 } from 'three';
import type { AppContext } from '../app/context';
import { errorLog } from '../app/errors';
import { propagate } from '../core/solver';
import { BREAK, KEEP, UNKNOWN, type Axis } from '../core/types';
import type { LevelController } from '../game/LevelController';
import { MockPlatform } from '../platform/MockPlatform';
import { h } from '../ui/dom';
import type { GameScreen } from '../ui/screens/GameScreen';
import { ST_HIDDEN, ST_HINT, ST_HOVER, ST_LINE } from '../render/cubeMaterial';

const DEBUG_CSS = `
.debug-panel { position: absolute; top: calc(var(--safe-t) + 4rem); right: 0.5rem; z-index: 50;
  pointer-events: auto; font: 12px/1.3 ui-monospace, monospace; background: rgba(0, 0, 0, 0.7);
  color: #bff; padding: 6px 8px; border-radius: 6px; max-width: 14rem; }
.debug-panel button { font: inherit; margin: 2px; padding: 2px 6px; cursor: pointer; }
`;

/**
 * Debug-режим (`?debug=1`, только dev/debug-сборка, §10): FPS, выбор любого
 * уровня, показ решения, шаг решателя, API для e2e. В prod-сборке вырезается.
 */
export function installDebug(app: AppContext): void {
  document.head.append(h('style', { text: DEBUG_CSS }));
  const fps = h('div', { text: 'FPS —' });
  const game = () =>
    app.router.currentId === 'game' ? (app.router.currentScreen as GameScreen) : null;
  const ctl = (): LevelController | null => game()?.currentController ?? null;

  const solveStep = (): number => {
    const c = ctl();
    if (!c || c.session.status !== 'playing') return 0;
    const s = c.session;
    const n = s.grid.cellCount;
    const state = new Uint8Array(n);
    for (let i = 0; i < n; i++) state[i] = s.broken[i] ? BREAK : s.marked[i] ? KEEP : UNKNOWN;
    propagate(s.puzzle, state);
    let acted = 0;
    for (let i = 0; i < n && s.status === 'playing'; i++) {
      if (state[i] === BREAK && !s.broken[i]) {
        c.hammerCell(i);
        acted++;
      }
    }
    return acted;
  };

  let showSol = false;
  const api = {
    app,
    errors: errorLog,
    platformLog: () => (app.platform instanceof MockPlatform ? [...app.platform.log] : []),
    go: (id: Parameters<typeof app.router.go>[0], params?: Parameters<typeof app.router.go>[1]) =>
      app.router.go(id, params),
    /** Состояние текущего уровня. */
    level: () => {
      const c = ctl();
      if (!c) return null;
      const s = c.session;
      return {
        id: c.level.id,
        status: s.status,
        mistakes: s.mistakes,
        remaining: s.remainingToBreak,
        elapsed: s.elapsed,
        tool: c.effectiveTool,
        slice: { ...c.slice },
        locked: c.inputLocked,
        size: [...c.grid.size],
        camera: {
          az: c.renderer.orbit.az,
          pitch: c.renderer.orbit.pitch,
          zoom: c.renderer.orbit.zoom,
        },
        hover: c.hoverCell,
        broken: Array.from(s.broken),
        marked: Array.from(s.marked),
      };
    },
    /** Экранные координаты центра грани куба (CSS px страницы). */
    faceScreen: (cell: number, axis: Axis, sign: 1 | -1) => {
      const c = ctl();
      const r = c?.renderer ?? null;
      if (!c || !r) return null;
      const p = c.view.cellCenter(cell, new Vector3());
      if (axis === 0) p.x += 0.5 * sign;
      else if (axis === 1) p.y += 0.5 * sign;
      else p.z += 0.5 * sign;
      const s = r.project(p, new Vector3());
      const rect = r.canvas.getBoundingClientRect();
      return { x: s.x + rect.left, y: s.y + rect.top };
    },
    pick: (x: number, y: number) => ctl()?.pick(x, y) ?? null,
    /** Точка экрана над пустым местом canvas (не куб, не HUD, не ручка). */
    emptySpot: () => {
      const c = ctl();
      if (!c) return null;
      const rect = c.renderer.canvas.getBoundingClientRect();
      for (let fy = 0.25; fy <= 0.75; fy += 0.05) {
        for (const fx of [0.12, 0.88, 0.2, 0.8, 0.3, 0.7]) {
          const x = rect.left + rect.width * fx;
          const y = rect.top + rect.height * fy;
          if (document.elementFromPoint(x, y) !== c.renderer.canvas) continue;
          // Запас вокруг точки для жеста.
          const ok = [-60, 0, 60].every(
            (dx) =>
              !c.pick(x - rect.left + dx, y - rect.top) &&
              document.elementFromPoint(x + dx, y) === c.renderer.canvas,
          );
          if (ok) return { x, y };
        }
      }
      return null;
    },
    hammer: (i: number) => ctl()?.hammerCell(i),
    brush: (i: number) => ctl()?.brushCell(i),
    solveStep,
    /** Бот: решает текущий уровень через API контроллера. */
    solve: () => {
      for (let k = 0; k < 100 && solveStep() > 0; k++);
      return api.level();
    },
    /** Подсветить кубы решения. */
    toggleSolution: () => {
      const c = ctl();
      if (!c) return;
      showSol = !showSol;
      for (let i = 0; i < c.grid.cellCount; i++)
        c.view.setFlag(i, ST_HINT, showSol && c.session.puzzle.classes[i]! > 0);
    },
    stats: () => game()?.renderer?.stats ?? null,
    /**
     * Миниатюры решённой фигуры с трёх ракурсов (tools/render-thumbs.ts, §6.3):
     * кубы решения в цветах раскрытия, без стола. Возвращает data URL PNG.
     */
    thumbnail: async (packId: string, levelId: string): Promise<string[]> => {
      await app.router.go('game', { packId, levelId });
      const c = ctl();
      const r = c?.renderer;
      if (!c || !r) throw new Error('level not loaded');
      const sol = c.session.puzzle.classes;
      for (let i = 0; i < sol.length; i++) c.view.setFlag(i, ST_HIDDEN, !sol[i]);
      c.view.clearFlag(ST_HOVER | ST_LINE);
      c.view.startReveal();
      c.view.setRevealTime(1e3);
      r.stage.group.visible = false;
      r.setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
      const views: Array<[number, number]> = [
        [0, 0.12],
        [Math.PI / 4, 0.45],
        [Math.PI / 2, 0.12],
      ];
      const out: string[] = [];
      for (const [az, pitch] of views) {
        r.orbit.az = az;
        r.orbit.pitch = pitch;
        r.orbit.zoom = 0.92;
        r.renderNow();
        out.push(r.canvas.toDataURL('image/png'));
      }
      r.stage.group.visible = true;
      return out;
    },
  };
  (window as unknown as { __debug: typeof api }).__debug = api;

  const levelSelect = h('select', { attrs: { 'data-testid': 'debug-level' } });
  levelSelect.append(h('option', { text: 'уровень…', attrs: { value: '' } }));
  for (const p of app.content.packs) {
    for (const l of p.levels)
      levelSelect.append(
        h('option', { text: `${p.id}/${l.id}`, attrs: { value: `${p.id}/${l.id}` } }),
      );
  }
  levelSelect.addEventListener('change', () => {
    const [packId, levelId] = levelSelect.value.split('/');
    if (packId && levelId) void app.router.go('game', { packId, levelId });
    levelSelect.value = '';
  });
  const panel = h(
    'div',
    { class: 'debug-panel', attrs: { 'data-testid': 'debug-panel' } },
    fps,
    levelSelect,
    h(
      'div',
      null,
      h('button', { text: 'шаг', on: { click: () => solveStep() } }),
      h('button', { text: 'решить', on: { click: () => api.solve() } }),
      h('button', { text: 'решение', on: { click: () => api.toggleSolution() } }),
    ),
  );
  document.getElementById('ui')!.append(panel);

  let frames = 0;
  let last = performance.now();
  const tick = (now: number) => {
    frames++;
    if (now - last >= 1000) {
      const st = api.stats() as { drawCalls?: number } | null;
      fps.textContent =
        `FPS ${Math.round((frames * 1000) / (now - last))}` +
        (st?.drawCalls !== undefined ? ` · DC ${st.drawCalls}` : '');
      frames = 0;
      last = now;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
