import { describe, expect, it } from "vitest";
import {
  resolveEscape,
  resolveNavKey,
  resolveOutsideClick,
  type InteractionSnapshot,
} from "./interaction";

function snapshot(overrides: Partial<InteractionSnapshot> = {}): InteractionSnapshot {
  return {
    editing: false,
    surface: "none",
    panelExpanded: false,
    panelHasEntries: false,
    typingInPage: false,
    typingInPanelSearch: false,
    searchActive: false,
    ...overrides,
  };
}

/**
 * The regression this file exists for: Dynamic Hover's tooltip survived clicks and
 * only gave up the EDIT on an outside click (DECISIONS.md #55), until `#62` collapsed
 * that into a one-gesture close while working on Translate All. Both surfaces are
 * asserted together, because "the same rule for both" is the actual requirement — a
 * test that only covered the inspector would have passed straight through the bug.
 */
describe("outside click", () => {
  for (const surface of ["hover", "inspector"] as const) {
    it(`cancels only the edit, keeping the ${surface} tooltip open`, () => {
      expect(resolveOutsideClick(snapshot({ surface, editing: true }))).toBe("cancel-edit");
    });

    it(`closes the ${surface} tooltip once nothing is being edited`, () => {
      expect(resolveOutsideClick(snapshot({ surface }))).toBe("close-tooltip");
    });
  }

  it("does nothing when there is no tooltip at all", () => {
    expect(resolveOutsideClick(snapshot())).toBe("none");
  });

  it("never closes the tooltip in the same gesture that cancels an edit", () => {
    // Two presses/clicks are required, in that order — the second only reaches
    // "close-tooltip" because the first left `editing` false.
    const midEdit = snapshot({ surface: "hover", editing: true });
    expect(resolveOutsideClick(midEdit)).toBe("cancel-edit");
    expect(resolveOutsideClick({ ...midEdit, editing: false })).toBe("close-tooltip");
  });
});

describe("escape ladder", () => {
  it("unwinds one level per press, innermost first", () => {
    const full = snapshot({
      editing: true,
      surface: "inspector",
      panelExpanded: true,
      panelHasEntries: true,
      searchActive: true,
    });
    expect(resolveEscape(full)).toBe("cancel-edit");
    const noEdit = { ...full, editing: false };
    expect(resolveEscape(noEdit)).toBe("close-tooltip");
    const noTooltip = { ...noEdit, surface: "none" as const };
    expect(resolveEscape(noTooltip)).toBe("clear-search");
    expect(resolveEscape({ ...noTooltip, searchActive: false })).toBe("collapse-panel");
    expect(resolveEscape(snapshot())).toBe("none");
  });
});

describe("keyboard navigation ownership", () => {
  const navigable = snapshot({ panelExpanded: true, panelHasEntries: true });

  it("navigates with both axes when nothing else owns the keyboard", () => {
    expect(resolveNavKey("ArrowDown", navigable)).toBe("next");
    expect(resolveNavKey("ArrowRight", navigable)).toBe("next");
    expect(resolveNavKey("ArrowUp", navigable)).toBe("prev");
    expect(resolveNavKey("ArrowLeft", navigable)).toBe("prev");
    expect(resolveNavKey("Enter", navigable)).toBe("activate");
  });

  it("yields every key to an active editor", () => {
    const editing = { ...navigable, editing: true };
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"]) {
      expect(resolveNavKey(key, editing)).toBe("none");
    }
  });

  it("yields every key while focus is in a real Salesforce field", () => {
    const typing = { ...navigable, typingInPage: true };
    for (const key of ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter"]) {
      expect(resolveNavKey(key, typing)).toBe("none");
    }
  });

  it("keeps caret keys in the panel's own search box but still allows up/down", () => {
    const searching = { ...navigable, typingInPanelSearch: true };
    expect(resolveNavKey("ArrowDown", searching)).toBe("next");
    expect(resolveNavKey("ArrowUp", searching)).toBe("prev");
    // Left/Right move the caret in a text field — never claimed.
    expect(resolveNavKey("ArrowLeft", searching)).toBe("none");
    expect(resolveNavKey("ArrowRight", searching)).toBe("none");
  });

  it("stays silent when there is nothing to navigate", () => {
    expect(resolveNavKey("ArrowDown", snapshot({ panelExpanded: true }))).toBe("none");
    expect(resolveNavKey("ArrowDown", snapshot({ panelHasEntries: true }))).toBe("none");
  });

  it("ignores keys it does not own", () => {
    expect(resolveNavKey("a", navigable)).toBe("none");
    expect(resolveNavKey("Escape", navigable)).toBe("none");
    expect(resolveNavKey("Tab", navigable)).toBe("none");
  });
});
