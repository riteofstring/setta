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
  });
});
