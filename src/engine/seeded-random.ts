/**
 * mulberry32 — a small, fast, well-distributed 32-bit PRNG. The risk-of-ruin
 * simulation must be reproducible and unit-testable (CLAUDE.md §11), so it
 * never touches Math.random.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}
