import { type ComponentProps, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  areSlashSuggestionsPortalStylesEqual,
  ChatInput,
  resolveDictationStartPath,
  resolveDictationUnavailableFeedback,
} from "./ChatInput";

function buildSharePolicy(overrides: Partial<SharePolicy> = {}): SharePolicy {
  return {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowRun: false,
    allowLLM: false,
    allowExternalLinks: false,
    allowFileDownloads: false,
    allowMultipleRuns: false,
    runSnapshotMode: "ephemeral",
    ...overrides,
  };
}

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

function renderChatInput(
  overrides: Partial<ComponentProps<typeof ChatInput>> = {},
) {
  return renderToStaticMarkup(
    <ChatInput
      placeholderText="Type a message..."
      waitingForResponse={false}
      onSubmit={() => undefined}
      {...overrides}
    />,
  );
}

function getTextareaClassName(markup: string): string | null {
  const marker = "<textarea";
  const startIndex = markup.indexOf(marker);
  if (startIndex < 0) {
    return null;
  }
  const classIndex = markup.indexOf('class="', startIndex);
  if (classIndex < 0) {
    return null;
  }
  const valueStart = classIndex + 'class="'.length;
  const valueEnd = markup.indexOf('"', valueStart);
  if (valueEnd < 0) {
    return null;
  }
  return markup.slice(valueStart, valueEnd);
}

function getButtonTagByAriaLabel(
  markup: string,
  ariaLabel: string,
): string | null {
  const marker = `aria-label=\"${ariaLabel}\"`;
  const labelIndex = markup.indexOf(marker);
  if (labelIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", labelIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
}

function getButtonTagByText(markup: string, text: string): string | null {
  const marker = `>${text}`;
  const textIndex = markup.indexOf(marker);
  if (textIndex < 0) {
    return null;
  }
  const buttonStart = markup.lastIndexOf("<button", textIndex);
  if (buttonStart < 0) {
    return null;
  }
  const buttonEnd = markup.indexOf(">", buttonStart);
  if (buttonEnd < 0) {
    return null;
  }
  return markup.slice(buttonStart, buttonEnd);
}

describe("ChatInput attachment gating", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("shows share policy block when param changes are disallowed", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: false }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).toContain("Attachments blocked by share policy");
    expect(markup).not.toContain("Slots:");
    const menuButton = getButtonTagByAriaLabel(markup, "Attachment options");
    expect(menuButton).not.toBeNull();
    expect(menuButton).toContain("disabled");
  });

  it("shows slots when param changes are allowed", () => {
    useShareSession.setState({
      isDeploymentMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: true }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).not.toContain("Attachments blocked by share policy");
    expect(markup).not.toContain("Slots:");
    const menuButton = getButtonTagByAriaLabel(markup, "Attachment options");
    expect(menuButton).not.toBeNull();
    expect(menuButton).not.toContain("disabled");
  });

  it("renders a full-width textarea for wide layouts", () => {
    useShareSession.setState({
      isDeploymentMode: false,
      sharePolicy: buildSharePolicy(),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();
    const className = getTextareaClassName(markup);

    expect(className).not.toBeNull();
    expect(className).toContain("w-full");
    expect(className).toContain("max-w-none");
  });

  it("uses an inset focus ring so focus styles are not clipped", () => {
    const markup = renderChatInput();
    const className = getTextareaClassName(markup);

    expect(className).not.toBeNull();
    expect(className).toContain("focus:ring-inset");
    expect(className).toContain("focus:border-blue-500");
  });
});

describe("ChatInput composer controls", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders execution controls when provided", () => {
    const markup = renderChatInput({
      executionControls: {
        permissionMode: "minimal",
        searchEnabled: true,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
    });

    expect(markup).toContain("minimal");
    expect(markup).toContain("Search");
    expect(markup).not.toContain("Skills");
  });

  it("does not render slash buttons above the composer", () => {
    const markup = renderChatInput();

    expect(markup).not.toContain(">/new<");
    expect(markup).not.toContain(">/resume<");
    expect(markup).not.toContain(">/model<");
  });

  it("disables execution controls when the composer is disabled", () => {
    const markup = renderChatInput({
      disabled: true,
      executionControls: {
        permissionMode: "minimal",
        searchEnabled: true,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
      },
    });

    const permissionButton = getButtonTagByText(markup, "minimal");
    const searchButton = getButtonTagByText(markup, "Search");
    expect(permissionButton).not.toBeNull();
    expect(searchButton).not.toBeNull();
    expect(permissionButton).toContain("disabled");
    expect(searchButton).toContain("disabled");
  });

  it("defaults slash suggestions to below placement", () => {
    const markup = renderChatInput({
      value: "/res",
      onChange: vi.fn(),
    });

    expect(markup).toContain("top-[calc(100%+4px)]");
    expect(markup).toContain("overflow-x-hidden");
  });

  it("supports explicit above placement for slash suggestions", () => {
    const markup = renderChatInput({
      value: "/res",
      onChange: vi.fn(),
      slashSuggestionsPlacement: "above",
    });

    expect(markup).toContain("bottom-[calc(100%+4px)]");
    expect(markup).toContain("overflow-x-hidden");
  });
});

describe("areSlashSuggestionsPortalStylesEqual", () => {
  it("returns true when both styles are null", () => {
    expect(areSlashSuggestionsPortalStylesEqual(null, null)).toBe(true);
  });

  it("returns true for equal geometry values", () => {
    const first: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };
    const second: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };

    expect(areSlashSuggestionsPortalStylesEqual(first, second)).toBe(true);
  });

  it("returns false when any tracked value changes", () => {
    const first: CSSProperties = {
      left: "12px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };
    const second: CSSProperties = {
      left: "14px",
      width: "340px",
      maxHeight: "180px",
      top: "44px",
      bottom: undefined,
    };

    expect(areSlashSuggestionsPortalStylesEqual(first, second)).toBe(false);
  });
});

describe("dictation mode resolution", () => {
  it("falls back to browser in auto mode when provider is unavailable", () => {
    const path = resolveDictationStartPath({
      dictationMode: "auto",
      canProviderDictate: false,
      canBrowserDictate: true,
    });

    expect(path).toBe("browser");
  });

  it("never routes browser mode through provider capture", () => {
    const path = resolveDictationStartPath({
      dictationMode: "browser",
      canProviderDictate: true,
      canBrowserDictate: true,
    });

    expect(path).toBe("browser");
  });

  it("uses explicit provider-unavailable messaging in provider mode", () => {
    const feedback = resolveDictationUnavailableFeedback({
      dictationMode: "provider",
      providerUnavailableMessage:
        "Provider dictation requires a valid transcription config.",
    });

    expect(feedback).toBe(
      "Provider dictation requires a valid transcription config.",
    );
  });
});
