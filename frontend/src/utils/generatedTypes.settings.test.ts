import { createSettingsState } from "./generatedTypes";
import { describe, expect, it } from "vitest";

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
