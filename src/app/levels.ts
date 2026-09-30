import { parseLevel, type Level, type PackJson } from '../core/level';
import { embeddedContent, type ContentIndex } from './content';

/** Ленивая загрузка наборов уровней (§5.1: один JSON на набор). */
export class LevelStore {
  private readonly packs = new Map<string, Promise<PackJson>>();

  constructor(readonly index: ContentIndex) {}

  loadPack(packId: string): Promise<PackJson> {
    let p = this.packs.get(packId);
    if (!p) {
      const emb = embeddedContent()?.packs[packId] as PackJson | undefined;
      if (emb) return Promise.resolve(emb);
      p = fetch(`./levels/${packId}.json`).then(async (res) => {
        if (!res.ok) throw new Error(`levels/${packId}.json: ${res.status}`);
        return (await res.json()) as PackJson;
      });
      p.catch(() => this.packs.delete(packId));
      this.packs.set(packId, p);
    }
    return p;
  }

  async getLevel(packId: string, levelId: string): Promise<Level> {
    const pack = await this.loadPack(packId);
    const j = pack.levels.find((l) => l.id === levelId);
    if (!j) throw new Error(`level ${levelId} not found in ${packId}`);
    return parseLevel(j);
  }

  /** Следующий уровень: в этом наборе или первый в следующем. */
  next(packId: string, levelId: string): { packId: string; levelId: string } | null {
    const packs = this.index.packs.filter((p) => !p.debugOnly || p.id === packId);
    const pi = packs.findIndex((p) => p.id === packId);
    if (pi < 0) return null;
    const levels = packs[pi]!.levels;
    const li = levels.findIndex((l) => l.id === levelId);
    if (li >= 0 && li + 1 < levels.length) return { packId, levelId: levels[li + 1]!.id };
    for (let k = pi + 1; k < packs.length; k++) {
      const first = packs[k]!.levels[0];
      if (first) return { packId: packs[k]!.id, levelId: first.id };
    }
    return null;
  }
}
