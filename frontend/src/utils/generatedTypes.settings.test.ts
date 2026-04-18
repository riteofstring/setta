import { describe, expect, it } from "vitest";
import { createSettingsState } from "./generatedTypes";

describe("createSettingsState", () => {
  it("merges chat windowing defaults for partial overrides", () => {
    const defaults = createSettingsState().chatWindowing;
    const state = createSettingsState({
      chatWindowing: {
        restorePriorStateOnUnmaximize: false,
      },
    });

    expect(state.chatWindowing).toEqual({
      ...defaults,
      restorePriorStateOnUnmaximize: false,
    });
  });
});
