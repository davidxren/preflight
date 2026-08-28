import { describe, expect, it } from "vitest";
import { PATTERN_DETECTORS, triggerIndices } from "@/engine/pattern-detectors";
import type { DailyBar } from "@/market/types";

/** Builds a bar; date and volume are irrelevant to every detector. */
function bar(open: number, high: number, low: number, close: number): DailyBar {
  return { date: "2020-01-01", open, high, low, close, volume: 1 };
}

function detector(id: string) {
  const found = PATTERN_DETECTORS.find((d) => d.id === id);
  if (!found) throw new Error(`No detector ${id}`);
  return found;
}

describe("bullish engulfing", () => {
  const d = detector("bullish-engulfing");
  // Prior red 105 -> 100; today green opening at/below 100, closing at/above 105.
  const prior = bar(105, 106, 99, 100);

  it("triggers when today's body covers the prior red body", () => {
    const bars = [prior, bar(99, 107, 98, 106)];
    expect(d.triggers(bars, 1)).toBe(true);
  });

  it("triggers on the exact boundary open == prior close, close == prior open", () => {
    const bars = [prior, bar(100, 106, 99, 105)];
    expect(d.triggers(bars, 1)).toBe(true);
  });

  it("does not trigger when the prior bar was green", () => {
    const bars = [bar(100, 106, 99, 105), bar(99, 107, 98, 106)];
    expect(d.triggers(bars, 1)).toBe(false);
  });

  it("does not trigger when today closes red", () => {
    const bars = [prior, bar(106, 107, 98, 99)];
    expect(d.triggers(bars, 1)).toBe(false);
  });

  it("does not trigger when today opens above the prior close", () => {
    const bars = [prior, bar(101, 107, 98, 106)];
    expect(d.triggers(bars, 1)).toBe(false);
  });

  it("does not trigger when today closes below the prior open", () => {
    const bars = [prior, bar(99, 107, 98, 104)];
    expect(d.triggers(bars, 1)).toBe(false);
  });
});

describe("hammer", () => {
  const d = detector("hammer");

  it("triggers on a long lower wick with a small body", () => {
    // body 1, lowerWick 6, upperWick 0, range 7.
    const bars = [bar(100, 101, 94, 101)];
    expect(d.triggers(bars, 0)).toBe(true);
  });

  it("triggers exactly at lowerWick == 2*body and body == 0.4*range", () => {
    // open 100, close 102: body 2, lowerWick 4 (low 96), upperWick 2 (high 104),
    // range 8, and 2 == 0.4 * 8.
    const bars = [bar(100, 104, 96, 102)];
    expect(d.triggers(bars, 0)).toBe(true);
  });

  it("does not trigger when the lower wick is under twice the body", () => {
    // body 2, lowerWick 2, upperWick 2, range 6: the other two conditions
    // hold, so only the lower-wick rule can reject this bar.
    const bars = [bar(100, 104, 98, 102)];
    expect(d.triggers(bars, 0)).toBe(false);
  });

  it("does not trigger when the upper wick is larger than the body", () => {
    const bars = [bar(100, 106, 94, 101)];
    expect(d.triggers(bars, 0)).toBe(false);
  });

  it("does not trigger on a zero-range bar", () => {
    const bars = [bar(100, 100, 100, 100)];
    expect(d.triggers(bars, 0)).toBe(false);
  });
});

describe("20-day-high breakout close", () => {
  const d = detector("twenty-day-high-breakout");
  const history = Array.from({ length: 20 }, () => bar(100, 105, 95, 100));

  it("triggers when the close clears the prior 20 highs", () => {
    expect(d.triggers([...history, bar(100, 110, 99, 106)], 20)).toBe(true);
  });

  it("does not trigger when the close only matches the prior high", () => {
    expect(d.triggers([...history, bar(100, 110, 99, 105)], 20)).toBe(false);
  });

  it("looks back exactly 20 bars, not 21", () => {
    // A 200 high 21 bars back must not suppress a breakout over the last 20.
    const withOldSpike = [bar(100, 200, 95, 100), ...history];
    expect(d.triggers([...withOldSpike, bar(100, 110, 99, 106)], 21)).toBe(true);
  });
});

describe("gap up 4% or more", () => {
  const d = detector("gap-up-4pct");

  it("triggers exactly at a 4% gap", () => {
    expect(d.triggers([bar(100, 101, 99, 100), bar(104, 105, 103, 104)], 1)).toBe(true);
  });

  it("does not trigger just under 4%", () => {
    expect(d.triggers([bar(100, 101, 99, 100), bar(103.9, 105, 103, 104)], 1)).toBe(false);
  });
});

describe("three consecutive up closes", () => {
  const d = detector("three-up-closes");

  it("triggers on three strictly rising closes", () => {
    const bars = [bar(1, 1, 1, 100), bar(1, 1, 1, 101), bar(1, 1, 1, 102), bar(1, 1, 1, 103)];
    expect(d.triggers(bars, 3)).toBe(true);
  });

  it("does not trigger when one close is flat", () => {
    const bars = [bar(1, 1, 1, 100), bar(1, 1, 1, 101), bar(1, 1, 1, 101), bar(1, 1, 1, 103)];
    expect(d.triggers(bars, 3)).toBe(false);
  });
});

describe("triggerIndices", () => {
  it("never reads before the start of the series", () => {
    const bars = Array.from({ length: 30 }, (_, i) => bar(100 + i, 110 + i, 90 + i, 105 + i));
    for (const d of PATTERN_DETECTORS) {
      const indices = triggerIndices(d, bars);
      expect(indices.every((t) => t >= d.lookback)).toBe(true);
    }
  });

  it("covers all five specified detectors", () => {
    expect(PATTERN_DETECTORS.map((d) => d.id)).toEqual([
      "bullish-engulfing",
      "hammer",
      "twenty-day-high-breakout",
      "gap-up-4pct",
      "three-up-closes",
    ]);
  });
});
