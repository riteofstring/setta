import { CODEMIRROR_TOOLTIP_PARENT_ID } from "utils/constants";
import { describe, expect, it } from "vitest";
import {
  buildTextInputCodeMirrorCoreView,
  getInitialTextInputCodeMirrorActivationEvent,
  planTextInputCodeMirrorMouseDown,
  shouldActivateTextInputCodeMirrorFromFocus,
  shouldAutoActivateTextInputCodeMirrorOnMount,
  shouldRenderTextInputCodeMirrorDummy,
} from "./textInputCodeMirrorView";

describe("planTextInputCodeMirrorMouseDown", () => {
  it("activates the real editor and marks the section active on left click", () => {
    expect(
      planTextInputCodeMirrorMouseDown({
        button: 0,
        isDisabled: false,
      }),
    ).toEqual({
      shouldActivate: true,
      shouldApplyActiveSectionChange: true,
    });
  });

  it("ignores non-left clicks and disabled inputs", () => {
    expect(
      planTextInputCodeMirrorMouseDown({
        button: 2,
        isDisabled: false,
      }),
    ).toEqual({
      shouldActivate: false,
      shouldApplyActiveSectionChange: false,
    });
    expect(
      planTextInputCodeMirrorMouseDown({
        button: 0,
        isDisabled: true,
      }),
    ).toEqual({
      shouldActivate: false,
      shouldApplyActiveSectionChange: false,
    });
  });
});

describe("shouldActivateTextInputCodeMirrorFromFocus", () => {
  it("only activates tab focus when the editor is enabled and not already active", () => {
    expect(
      shouldActivateTextInputCodeMirrorFromFocus({
        hasActivationEvent: false,
        isDisabled: false,
      }),
    ).toBe(true);
    expect(
      shouldActivateTextInputCodeMirrorFromFocus({
        hasActivationEvent: true,
        isDisabled: false,
      }),
    ).toBe(false);
    expect(
      shouldActivateTextInputCodeMirrorFromFocus({
        hasActivationEvent: false,
        isDisabled: true,
      }),
    ).toBe(false);
  });
});

describe("shouldAutoActivateTextInputCodeMirrorOnMount", () => {
  it("activates once for enabled Pixi handoff mounts that do not already have an activation event", () => {
    expect(
      shouldAutoActivateTextInputCodeMirrorOnMount({
        hasActivationEvent: false,
        hasAutoActivatedOnMount: false,
        isDisabled: false,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(true);
  });

  it("does not auto-activate when the editor is disabled, already active, or already auto-activated", () => {
    expect(
      shouldAutoActivateTextInputCodeMirrorOnMount({
        hasActivationEvent: true,
        hasAutoActivatedOnMount: false,
        isDisabled: false,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoActivateTextInputCodeMirrorOnMount({
        hasActivationEvent: false,
        hasAutoActivatedOnMount: true,
        isDisabled: false,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(false);
    expect(
      shouldAutoActivateTextInputCodeMirrorOnMount({
        hasActivationEvent: false,
        hasAutoActivatedOnMount: false,
        isDisabled: true,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(false);
  });
});

describe("getInitialTextInputCodeMirrorActivationEvent", () => {
  it("starts auto-activated Pixi handoff mounts on the real editor immediately", () => {
    expect(
      getInitialTextInputCodeMirrorActivationEvent({
        isDisabled: false,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe("tab");
  });

  it("keeps the initial activation empty when the mount should not auto-activate", () => {
    expect(
      getInitialTextInputCodeMirrorActivationEvent({
        isDisabled: true,
        shouldAutoActivateOnMount: true,
      }),
    ).toBeNull();
    expect(
      getInitialTextInputCodeMirrorActivationEvent({
        isDisabled: false,
        shouldAutoActivateOnMount: false,
      }),
    ).toBeNull();
  });
});

describe("shouldRenderTextInputCodeMirrorDummy", () => {
  it("skips the dummy shell once an auto-activated mount already has the real editor activation event", () => {
    expect(
      shouldRenderTextInputCodeMirrorDummy({
        hasActivationEvent: true,
        isRealEditorInitialized: false,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(false);
  });

  it("keeps the dummy shell for non-auto mounts until the real editor is initialized", () => {
    expect(
      shouldRenderTextInputCodeMirrorDummy({
        hasActivationEvent: true,
        isRealEditorInitialized: false,
        shouldAutoActivateOnMount: false,
      }),
    ).toBe(true);
    expect(
      shouldRenderTextInputCodeMirrorDummy({
        hasActivationEvent: false,
        isRealEditorInitialized: true,
        shouldAutoActivateOnMount: true,
      }),
    ).toBe(false);
  });
});

describe("buildTextInputCodeMirrorCoreView", () => {
  it("builds the key-name editor id, enables python autocomplete, and normalizes missing tooltip parents", () => {
    expect(
      buildTextInputCodeMirrorCoreView({
        sectionId: "section-1",
        paramInfoId: "param-1",
        isKeyName: true,
        isDeploymentMode: false,
        autocomplete: true,
        language: "python",
        tooltipParentDivId: undefined,
      }),
    ).toEqual({
      divId: "CodeMirror-section-1-param-1-keyName",
      shouldAutocomplete: true,
      resolvedTooltipParentDivId: null,
    });
  });

  it("keeps explicit tooltip parents while disabling autocomplete outside local python editing", () => {
    expect(
      buildTextInputCodeMirrorCoreView({
        sectionId: "section-1",
        paramInfoId: null,
        isKeyName: false,
        isDeploymentMode: true,
        autocomplete: true,
        language: "python",
        tooltipParentDivId: CODEMIRROR_TOOLTIP_PARENT_ID,
      }),
    ).toEqual({
      divId: "CodeMirror-section-1-null",
      shouldAutocomplete: false,
      resolvedTooltipParentDivId: CODEMIRROR_TOOLTIP_PARENT_ID,
    });
  });
});
