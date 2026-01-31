import { renderToStaticMarkup } from "react-dom/server";
import { useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { getAttachmentPolicy } from "utils/attachmentPolicy";
import { type SharePolicy } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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

function renderChatInput() {
  return renderToStaticMarkup(
    <ChatInput
      placeholderText="Type a message..."
      waitingForResponse={false}
      onSubmit={() => undefined}
    />,
  );
}

function getButtonTag(markup: string, label: string): string | null {
  const marker = `${label}</button>`;
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
      isShareMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: false }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).toContain("Attachments blocked by share policy");
    expect(markup).not.toContain("Slots:");
    const attachButton = getButtonTag(markup, "Attach");
    expect(attachButton).not.toBeNull();
    expect(attachButton).toContain("disabled");
  });

  it("shows slots when param changes are allowed", () => {
    useShareSession.setState({
      isShareMode: true,
      sharePolicy: buildSharePolicy({ allowParamChanges: true }),
    });
    syncStoreInitialState(useShareSession);

    const markup = renderChatInput();

    expect(markup).not.toContain("Attachments blocked by share policy");
    const chatPolicy = getAttachmentPolicy("chat");
    if (!chatPolicy.maxFilesDisabled && chatPolicy.maxFiles !== null) {
      expect(markup).toContain(`Slots: ${chatPolicy.maxFiles}`);
    } else {
      expect(markup).not.toContain("Slots:");
    }
    const attachButton = getButtonTag(markup, "Attach");
    expect(attachButton).not.toBeNull();
    expect(attachButton).not.toContain("disabled");
  });
});
