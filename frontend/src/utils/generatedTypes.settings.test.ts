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

  it("preserves language server defaults for partial overrides", () => {
    const state = createSettingsState({
      languageServer: {},
    });

    expect(state.languageServer).toEqual({
      selectedByLanguage: {},
    });
  });

  it("keeps explicit language selections when merging language server defaults", () => {
    const state = createSettingsState({
      languageServer: {
        selectedByLanguage: {
          python: null,
        },
      },
    });

    expect(state.languageServer.selectedByLanguage).toEqual({
      python: null,
    });
  });
});
