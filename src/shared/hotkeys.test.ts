import { describe, expect, it } from "vitest";
import { bareKeysConflict, normalizeBareKey, pickAvailableBareKey } from "./hotkeys";

describe("normalizeBareKey", () => {
  it("aliases Ctrl to Control", () => {
    expect(normalizeBareKey("Ctrl")).toBe("CONTROL");
  });

  it("uppercases regardless of input case", () => {
    expect(normalizeBareKey("alt")).toBe("ALT");
    expect(normalizeBareKey("Shift")).toBe("SHIFT");
  });

  it("passes null through", () => {
    expect(normalizeBareKey(null)).toBeNull();
  });
});

describe("bareKeysConflict", () => {
  it("flags the same key regardless of case", () => {
    expect(bareKeysConflict("Alt", "alt")).toBe(true);
  });

  it("treats Ctrl and Control as the same key", () => {
    expect(bareKeysConflict("Ctrl", "Control")).toBe(true);
  });

  it("does not flag different keys", () => {
    expect(bareKeysConflict("Alt", "Shift")).toBe(false);
  });

  it("never conflicts when either side is disabled (null)", () => {
    expect(bareKeysConflict(null, "Alt")).toBe(false);
    expect(bareKeysConflict("Alt", null)).toBe(false);
    expect(bareKeysConflict(null, null)).toBe(false);
  });
});

describe("pickAvailableBareKey", () => {
  it("returns the preferred key when it doesn't conflict", () => {
    expect(pickAvailableBareKey("Alt", "Shift")).toBe("Alt");
    expect(pickAvailableBareKey("Alt", null)).toBe("Alt");
  });

  it("falls back to the next available pool candidate on conflict", () => {
    expect(pickAvailableBareKey("Alt", "Alt")).toBe("Shift");
  });

  it("skips further into the pool if needed", () => {
    expect(pickAvailableBareKey("Alt", "alt")).toBe("Shift");
  });
});
