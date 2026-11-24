import { describe, expect, it } from "vitest";
import {
  cardCount,
  formatPrice,
  localDay,
  localTime,
  nextStatuses,
  parsePrice,
  withinHours,
} from "./rules";

describe("ordering hours", () => {
  it("is open all day when blank", () => {
    expect(withinHours("", "", "03:00")).toBe(true);
  });
  it("opens and closes on the same day", () => {
    expect(withinHours("08:00", "18:00", "07:59")).toBe(false);
    expect(withinHours("08:00", "18:00", "08:00")).toBe(true);
    expect(withinHours("08:00", "18:00", "18:00")).toBe(false);
  });
  it("runs past midnight", () => {
    expect(withinHours("20:00", "02:00", "23:30")).toBe(true);
    expect(withinHours("20:00", "02:00", "01:00")).toBe(true);
    expect(withinHours("20:00", "02:00", "12:00")).toBe(false);
  });
});

describe("venue clock", () => {
  const at = new Date("2026-03-01T23:30:00Z");
  it("uses the venue's time zone", () => {
    expect(localDay("UTC", at)).toBe("2026-03-01");
    expect(localDay("Asia/Riyadh", at)).toBe("2026-03-02");
    expect(localTime("Asia/Riyadh", at)).toBe("02:30");
  });
  it("falls back to UTC for an unknown zone", () => {
    expect(localDay("Nowhere/Else", at)).toBe("2026-03-01");
  });
});

describe("prices", () => {
  it("parses and formats", () => {
    expect(parsePrice("3.2")).toBe(320);
    expect(parsePrice("3,90")).toBe(390);
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice("-1")).toBeNull();
    expect(formatPrice(990)).toBe("9.90");
  });
});

describe("orders and cards", () => {
  it("only moves forward", () => {
    expect(nextStatuses("pending")).toEqual(["waiting", "rejected"]);
    expect(nextStatuses("ready")).toEqual(["done", "cancelled"]);
    expect(nextStatuses("done")).toEqual([]);
  });
  it("counts a new card's two starting stamps", () => {
    expect(cardCount(2, 1)).toBe(3);
  });
});
