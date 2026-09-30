import {
  ColorManagement,
  DirectionalLight,
  HemisphereLight,
  LinearSRGBColorSpace,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
  Vector4,
  WebGLRenderer,
} from 'three';
import type { BlockView } from './BlockView';
import { OrbitCamera, type Insets } from './OrbitCamera';
import { Particles } from './Particles';
import { Stage } from './Stage';
import { ToolFx } from './ToolFx';
import { CUBE_COLORS, LIGHT_DIR } from './cubeMaterial';

// Цвета задаются и смешиваются «как есть» (sRGB), без преобразований.
ColorManagement.enabled = false;

export type Animator = (dt: number, time: number) => boolean;

function isMobile(): boolean {
  return (
    matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent)
  );
}

/**
 * Рендер по требованию (§7): кадр рисуется только после `invalidate()`
 * или пока активны анимации. В кадре нет аллокаций.
 */
export class Renderer {
  readonly gl: WebGLRenderer;
  readonly scene = new Scene();
  readonly orbit = new OrbitCamera();
  readonly particles = new Particles();
  readonly stage = new Stage();
  readonly toolFx = new ToolFx();
  private readonly toolAnim: Animator = (dt) => this.toolFx.update(dt);
  readonly canvas: HTMLCanvasElement;
  private block: BlockView | null = null;
  private readonly animators = new Set<Animator>();
  private readonly afterRender = new Set<() => void>();
  private raf = 0;
  private lastTime = 0;
  private time = 0;
  private width = 1;
  private height = 1;
  private readonly topBasis = new Vector4();
  private readonly raycaster = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly tmp = new Vector3();
  private readonly ro: ResizeObserver;
  private contextLost = false;
  /** Статистика для debug-панели. */
  readonly stats = { frames: 0, drawCalls: 0, triangles: 0 };

  constructor(private readonly container: HTMLElement) {
    this.gl = new WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.gl.outputColorSpace = LinearSRGBColorSpace;
    this.gl.setClearColor(0x000000, 0);
    this.canvas = this.gl.domElement;
    this.canvas.setAttribute('data-testid', 'game-canvas');
    this.canvas.tabIndex = -1;
    container.append(this.canvas);

    // Реквизит (стол, частицы) освещается так же, как кубы в шейдере.
    const hemi = new HemisphereLight(CUBE_COLORS.sky, CUBE_COLORS.ground, 2.5);
    const sun = new DirectionalLight(CUBE_COLORS.light, 1.3);
    sun.position.set(...LIGHT_DIR);
    this.scene.add(hemi, sun, this.stage.group, this.particles.mesh, this.toolFx.group);

    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.invalidate();
    });
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
  }

  get currentBlock(): BlockView | null {
    return this.block;
  }

  setBlock(view: BlockView | null): void {
    if (this.block) this.block.group.removeFromParent();
    this.block = view;
    this.particles.clear();
    if (view) {
      this.scene.add(view.group);
      this.orbit.setBounds(view.grid.size);
      this.stage.fit(view.grid.size);
      this.stage.group.visible = true;
    } else {
      this.stage.group.visible = false;
    }
    this.invalidate();
  }

  setInsets(insets: Insets): void {
    this.orbit.setInsets(insets);
    this.invalidate();
  }

  resize(): void {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.width = w;
    this.height = h;
    const cap = isMobile() ? 1.75 : 2;
    this.gl.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.gl.setSize(w, h, false);
    this.orbit.setViewport(w, h);
    this.invalidate();
  }

  get viewportSize(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /** Добавить анимацию: вызывается каждый кадр, пока возвращает true. */
  animate(fn: Animator): void {
    this.animators.add(fn);
    this.invalidate();
  }

  /** Молоток или кисть у куба с центром `cell` (мир). */
  playTool(kind: 'hammer' | 'brush', cell: Vector3): void {
    this.toolFx.play(kind, cell, this.orbit.camera);
    this.animate(this.toolAnim);
  }

  stopAnimation(fn: Animator): void {
    this.animators.delete(fn);
  }

  onAfterRender(fn: () => void): () => void {
    this.afterRender.add(fn);
    return () => this.afterRender.delete(fn);
  }

  /** Нарисовать кадр синхронно (для снимков canvas: буфер ещё не очищен). */
  renderNow(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.frame(performance.now());
  }

  invalidate(): void {
    if (this.raf) return;
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number): void => {
    this.raf = 0;
    const dt = this.lastTime ? Math.min(0.1, Math.max(0, (now - this.lastTime) / 1000)) : 1 / 60;
    this.lastTime = now;
    this.time += dt;
    let active = false;
    for (const fn of this.animators) {
      if (fn(dt, this.time)) active = true;
      else this.animators.delete(fn);
    }
    if (this.orbit.update(dt)) active = true;
    if (this.particles.active > 0 && this.particles.update(dt)) active = true;
    if (this.block) {
      this.block.flush();
      const u = this.block.material.uniforms;
      this.orbit.topBasis(this.topBasis);
      (u.uTopBasis!.value as Vector4).copy(this.topBasis);
      u.uTime!.value = this.time;
    }
    if (!this.contextLost) {
      this.gl.render(this.scene, this.orbit.camera);
      this.stats.frames++;
      this.stats.drawCalls = this.gl.info.render.calls;
      this.stats.triangles = this.gl.info.render.triangles;
    }
    for (const fn of this.afterRender) fn();
    if (active) this.invalidate();
    else this.lastTime = 0;
  };

  /** Луч из точки экрана (CSS px относительно canvas) в пространстве сетки блока. */
  rayToGrid(x: number, y: number, origin: Vector3, dir: Vector3): boolean {
    if (!this.block) return false;
    this.ndc.set((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.orbit.camera);
    const g = this.block.group;
    // Блок во время игры не вращается; учитываем только сдвиг группы.
    origin.copy(this.raycaster.ray.origin).sub(g.position).add(this.block.gridOffset);
    dir.copy(this.raycaster.ray.direction);
    return true;
  }

  /** Мировая точка → CSS px относительно canvas. z > 1 — за камерой. */
  project(p: Vector3, out: Vector3): Vector3 {
    out.copy(p).project(this.orbit.camera);
    const z = out.z;
    out.set((out.x * 0.5 + 0.5) * this.width, (-out.y * 0.5 + 0.5) * this.height, z);
    return out;
  }

  /** Экранный вектор единичного шага вдоль оси из точки p (CSS px). */
  screenAxis(p: Vector3, axis: 0 | 1 | 2, out: Vector2): Vector2 {
    const a = this.project(p, this.tmp);
    const ax = a.x;
    const ay = a.y;
    const q = this.tmp.copy(p);
    if (axis === 0) q.x += 1;
    else if (axis === 1) q.y += 1;
    else q.z += 1;
    const b = this.project(q, this.tmp);
    return out.set(b.x - ax, b.y - ay);
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.stage.dispose();
    this.toolFx.dispose();
    this.gl.dispose();
    this.canvas.remove();
  }
}
