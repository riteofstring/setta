import { describe, expect, it } from "vitest";
import { createSettingsState } from "./generatedTypes";

describe("createSettingsState", () => {
  it("defaults chat window auto-creation off", () => {
    expect(createSettingsState().chatWindowing.autoCreateInitialChat).toBe(
      false,
    );
  });

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

  it("merges languageServer defaults for partial overrides", () => {
    const state = createSettingsState({
      languageServer: {},
    });

    expect(state.languageServer.selectedByLanguage).toEqual({});
  });

  it("preserves explicit null languageServer selections", () => {
    const state = createSettingsState({
      languageServer: {
        selectedByLanguage: {
          python: null,
        },
      },
    });

    expect(state.languageServer.selectedByLanguage.python).toBeNull();
  });
});
