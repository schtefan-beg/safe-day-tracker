import { describe, expect, it } from "vitest";
import { balance, EMPTY_GAME, grantQuest, level, purchase } from "@/lib/game";

describe("Local companion rewards", () => {
  it("rewards a quest only once, even after an edit or repeated click", () => {
    const once = grantQuest(EMPTY_GAME, "2026-10-11:psy");
    expect(balance(once)).toBe(10);
    expect(grantQuest(once, "2026-10-11:psy")).toBe(once);
    expect(balance(grantQuest(once, "2026-10-12:psy"))).toBe(20);
  });
  it("does not sell unaffordable or unknown items", () => {
    expect(purchase(EMPTY_GAME, "flower")).toBe(EMPTY_GAME);
    expect(purchase(EMPTY_GAME, "unknown")).toBe(EMPTY_GAME);
  });
  it("deducts the price once and equips an unlocked accessory", () => {
    const game = { ...EMPTY_GAME, claims: ["a", "b", "c"] };
    const bought = purchase(game, "flower");
    expect(balance(bought)).toBe(0);
    expect(bought.equipped).toBe("flower");
    expect(purchase(bought, "flower")).toBe(bought);
    expect(game.owned).toEqual([]);
  });
  it("grows through participation rather than symptom scores", () => {
    expect(level(EMPTY_GAME)).toBe(1);
    expect(level({ ...EMPTY_GAME, claims: Array.from({ length: 8 }, (_, i) => String(i)) })).toBe(2);
  });
});