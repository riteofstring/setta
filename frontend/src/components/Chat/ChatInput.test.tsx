import { type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHAT_STARTER_PROMPTS } from "./chatComposerControls";
import { ChatInput } from "./ChatInput";

function buildSharePolicy(overrides: Partial<SharePolicy> = {}): SharePolicy {
  return {
    allowParamChanges: true,
    allowVariantChanges: true,
    allowLayoutChanges: true,
    allowRun: false,
    allowLLM: false,
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
});

describe("ChatInput composer controls", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    resetProjectStores();
  });

  it("renders starter prompts and quick slash controls", () => {
    const markup = renderChatInput({
      starterPrompts: CHAT_STARTER_PROMPTS,
      showPythonStarterPrompts: true,
      showQuickSlashButtons: true,
    });

    expect(markup).toContain("Create Project");
    expect(markup).toContain("Summarize Codebase");
    expect(markup).toContain("/new");
    expect(markup).toContain("/resume");
    expect(markup).toContain("/model");
  });

  it("hides python starter prompt when python is unavailable", () => {
    const markup = renderChatInput({
      starterPrompts: CHAT_STARTER_PROMPTS,
      showPythonStarterPrompts: false,
    });

    expect(markup).not.toContain("Create Project");
    expect(markup).toContain("Summarize Codebase");
  });

  it("renders execution controls when provided", () => {
    const markup = renderChatInput({
      executionControls: {
        permissionMode: "minimal",
        searchEnabled: true,
        skillsEnabled: false,
        onPermissionModeChange: vi.fn(),
        onSearchEnabledChange: vi.fn(),
        onSkillsEnabledChange: vi.fn(),
      },
    });

    expect(markup).toContain("minimal");
    expect(markup).toContain("Search");
    expect(markup).toContain("Skills");
  });

  it("hides quick slash buttons unless explicitly enabled", () => {
    const markup = renderChatInput({
      starterPrompts: CHAT_STARTER_PROMPTS,
      showPythonStarterPrompts: true,
    });

    expect(markup).not.toContain("/new");
    expect(markup).not.toContain("/resume");
    expect(markup).not.toContain("/model");
  });
});
