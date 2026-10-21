// Tiệm kem voice line ids (Story 1.10), pure. Every id is a literal line of content/voice-lines.ts
// (lines.test.ts enumerates every reachable request); nothing is concatenated at play time.
import { askLine, retryLine, type FlavourId } from '../../content/games/ice-cream';
import type { Question } from './questions';

type Request = Pick<Question, 'wanted' | 'ordered'>;

/** The request: one flavour ("Xoài ơi, kem … nào!"), an unordered set (spoken order) or an ordered sequence. */
export function askLineId(q: Request): string {
  if (q.ordered) return `vo.ice-cream.ask-order.${q.wanted.join('-')}`;
  if (q.wanted.length === 1) return askLine(q.wanted[0]!);
  return `vo.ice-cream.ask.${q.wanted.join('-')}`;
}

/**
 * The retry after a wrong scoop, once `placed` are on the cone: unordered names the first remaining
 * wanted flavour; ordered names the flavour expected next ("Trước tiên là…" when nothing is placed).
 */
export function retryLineId(q: Request, placed: readonly FlavourId[]): string {
  if (q.ordered) {
    const next = q.wanted[Math.min(placed.length, q.wanted.length - 1)]!;
    return placed.length === 0 ? `vo.ice-cream.order-first.${next}` : `vo.ice-cream.order-next.${next}`;
  }
  const next = q.wanted.find((f) => !placed.includes(f)) ?? q.wanted[q.wanted.length - 1]!;
  return retryLine(next);
}
