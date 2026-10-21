// Tiệm pizza voice line ids (Story 3.1), pure. Every id is a literal line of content/voice-lines.ts
// (lines.test.ts enumerates every reachable question); nothing is concatenated at play time.
import type { PizzaQuestion } from './questions';

/** The fox's request: "Xoài ơi, <n> lát <topping> nào!". */
export const askLineId = (q: PizzaQuestion): string => `vo.pizza.ask.${q.topping}.${q.count}`;
/** After a wrong topping: "Mình lấy <topping> nhé!". */
export const retryLineId = (q: Pick<PizzaQuestion, 'topping'>): string => `vo.pizza.retry.${q.topping}`;
/** The oven step's retry (an extra slice): "Đủ <n> lát rồi!". */
export const enoughLineId = (n: number): string => `vo.pizza.enough.${n}`;
/** The count of the n-th placed slice: "Một!", "Hai!", … */
export const countLineId = (n: number): string => `vo.pizza.count.${n}`;
/** The recount after the last slice: count.1 … count.n back to back. */
export const countLineIds = (n: number): string[] => Array.from({ length: n }, (_, i) => countLineId(i + 1));
/** The oven step's prompt: "Mình nướng bánh nào!". */
export const BAKE_LINE = 'vo.pizza.bake';
