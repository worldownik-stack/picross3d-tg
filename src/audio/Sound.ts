import type { SettingsStore } from '../app/settings';

/** Звуковые события игры (§9). */
export type Sfx = 'hit' | 'miss' | 'bonk' | 'mark' | 'unmark' | 'win' | 'tap';

/** Минимальный интервал между одинаковыми звуками, с (протяжка бьёт много кубов подряд). */
const MIN_GAP: Record<Sfx, number> = {
  hit: 0.035,
  miss: 0.1,
  bonk: 0.08,
  mark: 0.04,
  unmark: 0.04,
  win: 0.5,
  tap: 0.05,
};

type Ctx = AudioContext;

/**
 * Звук на Web Audio (§9): эффекты синтезируются процедурно с вариациями высоты, музыка —
 * спокойный генеративный луп (до появления CC0-треков владельца, D-052). Контекст создаётся
 * и разблокируется по первому жесту; громкость музыки и звуков — раздельные шины.
 */
export class Sound {
  private ctx: Ctx | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly last = new Map<Sfx, number>();
  private music: MusicLoop | null = null;
  private musicWanted = false;
  private paused = false;

  constructor(private readonly settings: SettingsStore) {
    settings.subscribe(() => this.applyMusic());
  }

  /** Разблокировать контекст по первому жесту пользователя. */
  installUnlock(target: EventTarget = window): void {
    const events = ['pointerdown', 'keydown', 'touchend'];
    const unlock = (): void => {
      const ctx = this.ensureContext();
      for (const e of events) target.removeEventListener(e, unlock, true);
      if (!ctx) return;
      if (!this.paused) void ctx.resume();
      this.applyMusic();
    };
    for (const e of events) target.addEventListener(e, unlock, true);
  }

  /** Музыка разрешена (после `ready()`, §9); играет, если включена в настройках. */
  startMusic(): void {
    this.musicWanted = true;
    this.applyMusic();
  }

  /** Внешняя пауза (SDK, скрытая вкладка, реклама): звук замолкает (§8). */
  setPaused(on: boolean): void {
    this.paused = on;
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  play(kind: Sfx): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxBus || this.paused || !this.settings.get().sound) return;
    if (ctx.state !== 'running') return;
    const t = ctx.currentTime;
    if (t - (this.last.get(kind) ?? -1) < MIN_GAP[kind]) return;
    this.last.set(kind, t);
    const v = 1 + (Math.random() - 0.5) * 0.12; // вариация высоты ±6 %
    const out = this.sfxBus;
    switch (kind) {
      case 'hit':
        this.tone(t, 'triangle', 210 * v, 95 * v, 0.12, 0.32, out);
        this.burst(t, 1800 * v, 0.05, 0.18, out);
        break;
      case 'miss':
        this.tone(t, 'sine', 95 * v, 42, 0.32, 0.55, out);
        this.burst(t, 320, 0.12, 0.2, out, 'lowpass');
        break;
      case 'bonk':
        this.tone(t, 'triangle', 540 * v, 470 * v, 0.07, 0.16, out);
        break;
      case 'mark':
        this.burst(t, 3600 * v, 0.11, 0.13, out);
        break;
      case 'unmark':
        this.burst(t, 2400 * v, 0.08, 0.09, out);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, k) =>
          this.tone(t + k * 0.07, 'triangle', f, f, 1.1, 0.16, out),
        );
        break;
      case 'tap':
        this.tone(t, 'sine', 880 * v, 760 * v, 0.035, 0.05, out);
        break;
    }
  }

  private ensureContext(): Ctx | null {
    if (this.ctx) return this.ctx;
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.gain.value = 0.9;
    this.sfxBus.connect(master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0;
    this.musicBus.connect(master);
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    return ctx;
  }

  private applyMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicBus) return;
    const on = this.musicWanted && this.settings.get().music;
    this.musicBus.gain.setTargetAtTime(on ? 0.55 : 0, ctx.currentTime, 0.4);
    if (on) (this.music ??= new MusicLoop(ctx, this.musicBus)).start();
    else this.music?.stop();
  }

  /** Тон с огибающей «удар — затухание» и скольжением частоты. */
  private tone(
    t: number,
    type: OscillatorType,
    f0: number,
    f1: number,
    dur: number,
    gain: number,
    out: AudioNode,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(out);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Короткий отфильтрованный шум. */
  private burst(
    t: number,
    freq: number,
    dur: number,
    gain: number,
    out: AudioNode,
    type: BiquadFilterType = 'bandpass',
  ): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = type === 'bandpass' ? 1.2 : 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(out);
    src.start(t, Math.random() * 0.3);
    src.stop(t + dur + 0.02);
  }
}

// ---------- Музыка ----------

const NOTE = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
/** Аккорды по тактам (MIDI): Cmaj7, Am7, Fmaj7, G6 — тихий круг в до мажоре. */
const CHORDS = [
  [48, 60, 64, 67, 71],
  [45, 57, 60, 64, 67],
  [41, 57, 60, 65, 69],
  [43, 55, 59, 62, 64],
];
/** Пентатоника до мажор для мелодии. */
const PENTA = [72, 74, 76, 79, 81, 84];
const BEAT = 60 / 68;
const EIGHTH = BEAT / 2;

/** Генеративный луп: пэд, бас и редкие «калимба»-ноты по детерминированному узору. */
class MusicLoop {
  private timer = 0;
  private next = 0;
  private step = 0;
  private seed = 7;

  constructor(
    private readonly ctx: Ctx,
    private readonly out: AudioNode,
  ) {}

  start(): void {
    if (this.timer) return;
    this.next = this.ctx.currentTime + 0.15;
    this.timer = window.setInterval(() => this.schedule(), 80);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = 0;
  }

  private rand(): number {
    // Узор повторяется каждые 8 тактов (64 восьмых): псевдослучайность от номера шага.
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  private schedule(): void {
    if (this.ctx.state !== 'running') return;
    while (this.next < this.ctx.currentTime + 0.3) {
      this.playStep(this.step, this.next);
      this.next += EIGHTH;
      this.step = (this.step + 1) % 64;
      if (this.step === 0) this.seed = 7;
    }
  }

  private playStep(step: number, t: number): void {
    const chord = CHORDS[Math.floor(step / 8) % CHORDS.length]!;
    const inBar = step % 8;
    if (inBar === 0) {
      for (const m of chord.slice(1)) this.voice(t, 'sine', NOTE(m), BEAT * 4.2, 0.022, 0.9);
    }
    if (inBar === 0 || inBar === 4)
      this.voice(t, 'sine', NOTE(chord[0]! - 12), BEAT * 1.8, 0.07, 0.03);
    const r = this.rand();
    if (inBar !== 0 && r < 0.38) {
      const m = PENTA[Math.floor(this.rand() * PENTA.length)]!;
      this.voice(t, 'triangle', NOTE(m), 0.9, 0.035, 0.005);
    }
  }

  private voice(
    t: number,
    type: OscillatorType,
    f: number,
    dur: number,
    gain: number,
    attack: number,
  ): void {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = f;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.out);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
