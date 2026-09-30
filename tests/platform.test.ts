import { describe, expect, it } from 'vitest';
import { MockPlatform } from '../src/platform/MockPlatform';
import { FULLSCREEN_AD_COOLDOWN_MS } from '../src/platform/BasePlatform';

function mk(now = { t: 0 }) {
  return new MockPlatform({ adDelayMs: 0, storage: null, now: () => now.t });
}

describe('Platform guarantees', () => {
  it('ready вызывается ровно один раз', () => {
    const p = mk();
    p.loadingReady();
    p.loadingReady();
    expect(p.log.filter((x) => x === 'ready')).toHaveLength(1);
  });

  it('нет двух start или двух stop подряд', () => {
    const p = mk();
    p.gameplayStop();
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    p.gameplayStart();
    expect(p.log).toEqual(['start', 'stop', 'start']);
  });

  it('реклама останавливает геймплей и ставит на паузу, затем возобновляет', async () => {
    const p = mk();
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    p.gameplayStart();
    const ok = await p.showRewardedAd();
    expect(ok).toBe(true);
    expect(events).toEqual(['pause', 'resume']);
    expect(p.log).toEqual(['start', 'stop', 'ad:rewarded', 'start']);
  });

  it('полноэкранная реклама не чаще кулдауна', async () => {
    const clock = { t: 100_000 };
    const p = mk(clock);
    await p.showFullscreenAd();
    clock.t += FULLSCREEN_AD_COOLDOWN_MS - 1;
    await p.showFullscreenAd();
    clock.t += 1;
    await p.showFullscreenAd();
    expect(p.log.filter((x) => x === 'ad:fullscreen')).toHaveLength(2);
  });

  it('пауза SDK и реклама складываются по причинам', async () => {
    const p = mk();
    const events: string[] = [];
    p.onPause(() => events.push('pause'));
    p.onResume(() => events.push('resume'));
    p.simulatePause();
    await p.showRewardedAd();
    expect(events).toEqual(['pause']);
    p.simulateResume();
    expect(events).toEqual(['pause', 'resume']);
  });
});
