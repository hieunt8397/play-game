import { describe, expect, it } from 'vitest';
import { VOICE_LINES } from '../voice-lines';
import { CONE_SLOTS, assets, ladder } from './ice-cream';

describe('ice-cream ladder (Story 1.10)', () => {
  it('level 0 is 1 scoop out of 2 flavours', () => {
    expect(ladder[0]).toMatchObject({ flavours: 2, scoops: 1, ordered: false });
  });

  it('flavours and scoops never decrease; each level raises one of them, the last adds order', () => {
    for (let i = 1; i < ladder.length; i++) {
      const a = ladder[i - 1]!;
      const b = ladder[i]!;
      expect(b.flavours).toBeGreaterThanOrEqual(a.flavours);
      expect(b.scoops).toBeGreaterThanOrEqual(a.scoops);
      const raised = b.flavours > a.flavours || b.scoops > a.scoops;
      if (i === ladder.length - 1) expect(raised || (b.ordered && !a.ordered), b.id).toBe(true);
      else expect(raised, b.id).toBe(true);
    }
  });

  it('scoops ≤ min(flavours, cone slots); 3–5 questions; only the last level is ordered', () => {
    ladder.forEach((l, i) => {
      expect(l.scoops).toBeLessThanOrEqual(Math.min(l.flavours, CONE_SLOTS.length, 3));
      expect(l.questions).toBeGreaterThanOrEqual(3);
      expect(l.questions).toBeLessThanOrEqual(5);
      expect(l.ordered, l.id).toBe(i === ladder.length - 1);
    });
    expect(new Set(ladder.map((l) => l.id)).size).toBe(ladder.length);
  });

  it('the game loads every vo.ice-cream.* line', () => {
    const lines = VOICE_LINES.map((l) => l.id).filter((id) => id.startsWith('vo.ice-cream.'));
    expect(lines).toHaveLength(52);
    for (const id of lines) expect(assets.audio).toContain(id);
  });
});
