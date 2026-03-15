// @vitest-environment jsdom

import { useSettings } from "state/stores/uiPreferenceStores";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const focusScopeMock = vi.hoisted(() => vi.fn());

vi.mock("components/Panes/paneFns", () => ({
  showParamUITypeTab: vi.fn(),
  showProjectOverviewTab: vi.fn(),
  showVersionsTab: vi.fn(),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  copyFloatingBoxContent: vi.fn(),
  copyFrozenFloatingBoxContent: vi.fn(),
  decrementFloatingBoxIdx: vi.fn(),
  decrementFrozenFloatingBoxIdx: vi.fn(),
  disableFloatingBox: vi.fn(),
  enableFloatingBox: vi.fn(),
  freezeFloatingBox: vi.fn(),
  getConvertFloatingBoxToSectionFn: vi.fn(() => vi.fn()),
  incrementFloatingBoxIdx: vi.fn(),
  incrementFrozenFloatingBoxIdx: vi.fn(),
  removeFrozenFloatingBox: vi.fn(),
}));

vi.mock("utils/focusManager", () => ({
  focusAdjacentTopLevelSection: vi.fn(),
  focusScope: focusScopeMock,
  handleTabNavigation: vi.fn(() => false),
}));

import { attachKeyEventListeners } from "./keyActivations";

describe("attachKeyEventListeners", () => {
  beforeEach(() => {
    useSettings.setState(createSettingsState());
  });

  afterEach(() => {
    vi.clearAllMocks();
    window.dispatchEvent(new Event("blur"));
  });

  it("routes configured shortcuts through the global keydown listener", () => {
    // The public listener entrypoint should still execute the bound shortcut action after the refactor.
    const cleanup = attachKeyEventListeners();

    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "1",
        code: "Digit1",
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(focusScopeMock).toHaveBeenCalledWith("header");

    cleanup();
  });
});
