import { levelPuzzle, type Level } from '../core/level';
import { BlockView } from './BlockView';
import { ST_HIDDEN } from './cubeMaterial';
import { GlyphAtlas } from './glyphAtlas';
import { DEFAULT_AZ, DEFAULT_PITCH } from './OrbitCamera';
import { Renderer, type Animator } from './Renderer';

export interface ShowOptions {
  /** Показать поворотный стол под фигурой. */
  stage?: boolean;
  az?: number;
  pitch?: number;
  zoom?: number;
}

/**
 * Готовая фигура уровня в цветах раскрытия (§4, коллекция): тот же рендер, что в игре,
 * но без подсказок и пустых кубов. Снимки для миниатюр и вращение для крупного просмотра.
 */
export class FigureStudio {
  readonly renderer: Renderer;
  private readonly atlas: GlyphAtlas;
  private view: BlockView | null = null;
  private spinFn: Animator | null = null;

  constructor(container: HTMLElement) {
    this.renderer = new Renderer(container);
    this.renderer.canvas.setAttribute('data-testid', 'figure-canvas');
    this.atlas = new GlyphAtlas(1);
  }

  show(level: Level, opts: ShowOptions = {}): void {
    this.clear();
    const view = new BlockView(levelPuzzle(level), this.atlas, level.palette, level.cells);
    for (let i = 0; i < level.cells.length; i++) view.setFlag(i, ST_HIDDEN, !level.cells[i]);
    view.startReveal();
    view.setRevealTime(1e3);
    this.view = view;
    const r = this.renderer;
    r.setBlock(view);
    r.stage.group.visible = opts.stage ?? true;
    r.setInsets({ top: 0, right: 0, bottom: 0, left: 0 });
    r.orbit.az = opts.az ?? DEFAULT_AZ;
    r.orbit.pitch = opts.pitch ?? DEFAULT_PITCH;
    r.orbit.zoom = opts.zoom ?? 1;
    r.invalidate();
  }

  /** Медленное вращение вокруг фигуры (рад/с). */
  spin(speed = 0.6): void {
    this.stopSpin();
    this.spinFn = (dt) => {
      this.renderer.orbit.az += dt * speed;
      return true;
    };
    this.renderer.animate(this.spinFn);
  }

  stopSpin(): void {
    if (this.spinFn) this.renderer.stopAnimation(this.spinFn);
    this.spinFn = null;
  }

  /** Кадр сейчас → PNG data URL. */
  snapshot(): string {
    this.renderer.renderNow();
    return this.renderer.canvas.toDataURL('image/png');
  }

  clear(): void {
    this.stopSpin();
    this.renderer.setBlock(null);
    this.view?.dispose();
    this.view = null;
  }

  dispose(): void {
    this.clear();
    this.atlas.dispose();
    this.renderer.dispose();
  }
}
