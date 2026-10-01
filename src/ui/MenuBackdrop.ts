/**
 * Фон главного меню (Приложение А.3, запасной вариант): тёплый градиент и медленно парящие
 * изометрические кубики на canvas 2D. Анимируется только пока меню на экране, ~30 кадров/с;
 * при «уменьшении движения» — неподвижный кадр.
 */
const COLORS = ['#d9ad7c', '#f2b63d', '#2aa99b', '#e0604a', '#8fc3e8', '#b5d67a', '#c28fd6'];
const COUNT = 16;
const FRAME = 1 / 30;

interface Cube {
  x: number;
  y: number;
  size: number;
  speed: number;
  phase: number;
  color: string;
  alpha: number;
}

export class MenuBackdrop {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly cubes: Cube[] = [];
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private w = 1;
  private h = 1;
  private readonly ro: ResizeObserver;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'menu-backdrop';
    this.canvas.setAttribute('aria-hidden', 'true');
    this.ctx = this.canvas.getContext('2d');
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.canvas);
  }

  start(): void {
    if (this.raf) return;
    this.resize();
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.draw();
      return;
    }
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private resize(): void {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.w = w;
    this.h = h;
    if (!this.cubes.length) for (let i = 0; i < COUNT; i++) this.cubes.push(this.spawn(true));
    this.draw();
  }

  private spawn(anywhere: boolean): Cube {
    const s = Math.min(this.w, this.h);
    const size = s * (0.035 + Math.random() * 0.045);
    return {
      x: Math.random() * this.w,
      y: anywhere ? Math.random() * this.h : this.h + size * 2,
      size,
      speed: 6 + Math.random() * 10,
      phase: Math.random() * Math.PI * 2,
      color: COLORS[Math.floor(Math.random() * COLORS.length)]!,
      alpha: 0.28 + Math.random() * 0.3,
    };
  }

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    if (this.acc < FRAME) return;
    const step = this.acc;
    this.acc = 0;
    this.time += step;
    for (let i = 0; i < this.cubes.length; i++) {
      const c = this.cubes[i]!;
      c.y -= c.speed * step;
      if (c.y < -c.size * 2) this.cubes[i] = this.spawn(false);
    }
    this.draw();
  };

  private draw(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const c of this.cubes) {
      const x = c.x + Math.sin(this.time * 0.4 + c.phase) * c.size * 0.6;
      // В центральной колонке (заголовок и кнопки) кубики бледнее.
      const side = Math.min(1, Math.abs(x - this.w / 2) / (this.w * 0.32));
      this.cube(ctx, x, c.y, c.size, c.color, c.alpha * (0.3 + 0.7 * side));
    }
  }

  /** Изометрический кубик: верх светлее, правая грань темнее. */
  private cube(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    s: number,
    color: string,
    alpha: number,
  ): void {
    const hw = s * 0.87;
    ctx.globalAlpha = alpha;
    ctx.fillStyle = shade(color, 1.18);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + hw, y - s / 2);
    ctx.lineTo(x, y);
    ctx.lineTo(x - hw, y - s / 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x - hw, y - s / 2);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - hw, y + s / 2);
    ctx.fill();
    ctx.fillStyle = shade(color, 0.78);
    ctx.beginPath();
    ctx.moveTo(x + hw, y - s / 2);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x + hw, y + s / 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}
