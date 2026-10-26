// Thay đồ cho Shiba (Story 8.2): the pure round model. No judging: there is no right outfit.
//   - a tap on an item that is not worn puts it on (one item per slot: a hat replaces the worn hat);
//   - a tap on the worn item takes it off;
//   - every wear or take-off is one change; after `roundChanges` changes the round completes (once) and free play
//     goes on with the voice silent (the item names are said only before that);
//   - the outfit itself is persistent (ProgressStore); the round only counts changes, so a resume restores
//     `{ changes }` and reads the outfit from the store.
// Rapid taps are never queued: each tap changes the outfit at once (the scene restarts its reaction).
import { itemSlot, nameLine, type Outfit, type OutfitItemId, type OutfitSlot } from '../../content/games/dress-up';
import type { ResumeAt } from '../../core/snapshot';

export type DressUpChange =
  | {
      readonly kind: 'wear';
      readonly slot: OutfitSlot;
      readonly id: OutfitItemId;
      /** The item it replaced in that slot (it comes off at once). */
      readonly replaced: OutfitItemId | undefined;
      /** The item's name line, while the round is not complete yet; undefined in free play. */
      readonly line: string | undefined;
      /** This change completes the round. */
      readonly completes: boolean;
    }
  | { readonly kind: 'takeOff'; readonly slot: OutfitSlot; readonly id: OutfitItemId; readonly completes: boolean };

export interface DressUpRound {
  /** A tap on an item icon; undefined for an unknown id (nothing changes). */
  tap(id: string): DressUpChange | undefined;
  readonly outfit: Outfit;
  readonly changes: number;
  readonly complete: boolean;
}

export function createDressUpRound(opts: { outfit: Outfit; roundChanges: number; changes?: number }): DressUpRound {
  let outfit: { [S in OutfitSlot]?: OutfitItemId } = { ...opts.outfit };
  let changes = Math.max(0, Math.floor(opts.changes ?? 0));
  const target = Math.max(1, Math.floor(opts.roundChanges));
  return {
    tap(id) {
      const slot = itemSlot(id);
      if (!slot) return undefined;
      const item = id as OutfitItemId;
      const wasComplete = changes >= target;
      changes += 1;
      const completes = !wasComplete && changes >= target;
      if (outfit[slot] === item) {
        const next = { ...outfit };
        delete next[slot];
        outfit = next;
        return { kind: 'takeOff', slot, id: item, completes };
      }
      const replaced = outfit[slot];
      outfit = { ...outfit, [slot]: item };
      return { kind: 'wear', slot, id: item, replaced, line: wasComplete ? undefined : nameLine(item), completes };
    },
    get outfit() {
      return { ...outfit };
    },
    get changes() {
      return changes;
    },
    get complete() {
      return changes >= target;
    },
  };
}

/** The changes of a resumed round (`{ changes }` at question 0, fewer than the round's), or null for a fresh start. */
export function resumeDressUp(resume: ResumeAt | null, roundChanges: number): { changes: number } | null {
  if (!resume || resume.questionIndex !== 0) return null;
  const partial = resume.partial as unknown;
  if (typeof partial !== 'object' || partial === null) return null;
  const changes = (partial as { changes?: unknown }).changes;
  if (typeof changes !== 'number' || !Number.isInteger(changes) || changes < 1 || changes >= roundChanges) return null;
  return { changes };
}
