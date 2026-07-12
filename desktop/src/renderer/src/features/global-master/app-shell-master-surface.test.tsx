import type { AcceptedMasterInput, SubmitMasterInputRequest } from "@generated/backend";
import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { AppShellMasterController } from "./app-shell-master-controller";
import {
  AppShellMasterSurface,
  isMasterOverlayShortcut,
  masterOverlayShortcutLabel,
  MasterSidebarLauncher,
} from "./app-shell-master-surface";

describe("app-shell master surface", () => {
  test("renders one conversational overlay with the shared draft and accepted history", async () => {
    const controller = masterController();
    controller.synchronizeRuntime("runtime_alpha");
    await flushPromises();
    controller.setDraft("Bring up the speech routing topic");
    controller.openOverlay();

    let html = renderSurface(controller);
    expect(html).toContain('data-testid="master-overlay"');
    expect(html).toContain("Bring up the speech routing topic");
    expect(html).toContain("What should Setta bring into focus?");
    expect(html).toContain("Ctrl+K");

    controller.submitText("Open the latest narrator conversation");
    await flushPromises();
    html = renderSurface(controller);

    expect(html).toContain("Open the latest narrator conversation");
    expect(html).toContain('data-master-input-state="accepted"');
    expect(html).toContain("Accepted into the global master session");
    expect(html).toContain('aria-label="Recent master exchanges"');
  });

  test("renders the compact sidebar launcher as a distinct entry point", () => {
    const html = renderToString(<MasterSidebarLauncher disabled={false} onOpen={() => {}} />);

    expect(html).toContain('data-testid="master-sidebar-launcher"');
    expect(html).toContain('aria-label="Open Ask Setta"');
    expect(html).toContain("Ask Setta");
  });

  test("accepts the primary-modifier shortcut without stealing modified variants", () => {
    expect(shortcut({ ctrlKey: true })).toBe(true);
    expect(shortcut({ metaKey: true })).toBe(true);
    expect(shortcut({ altKey: true, metaKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, shiftKey: true })).toBe(false);
    expect(shortcut({ ctrlKey: true, key: "j" })).toBe(false);
    expect(masterOverlayShortcutLabel("darwin")).toBe("⌘K");
    expect(masterOverlayShortcutLabel("win32")).toBe("Ctrl+K");
  });
});

function renderSurface(controller: AppShellMasterController): string {
  return renderToString(
    <AppShellMasterSurface controller={controller} platform="linux">
      {(overlayOpen) => <main data-overlay-open={overlayOpen} />}
    </AppShellMasterSurface>,
  );
}

function masterController(): AppShellMasterController {
  let inputOrdinal = 0;
  return new AppShellMasterController({
    createInputId: () => `master_input_${++inputOrdinal}`,
    now: () => new Date("2026-07-13T20:00:00Z"),
    readRecentMasterInputs: async () => ({ capacity: 40, inputs: [] }),
    readFocusHints: () => ({
      focusedConversationId: null,
      focusedPaneId: null,
      focusedWorkspaceId: "workspace_alpha",
    }),
    submitMasterInput: async (request) => acceptedInput(request, inputOrdinal),
  });
}

function acceptedInput(request: SubmitMasterInputRequest, sequence: number): AcceptedMasterInput {
  return {
    acceptedAt: "2026-07-13T20:00:01Z",
    input: request.input,
    replyDelivery: {
      originatingConversationId: null,
      originatingConversationInputId: null,
      originatingPaneId: null,
      originatingWorkspaceId: null,
      showInMasterOverlay: true,
    },
    sequence,
  };
}

function shortcut(
  overrides: Partial<{
    altKey: boolean;
    ctrlKey: boolean;
    key: string;
    metaKey: boolean;
    shiftKey: boolean;
  }>,
): boolean {
  return isMasterOverlayShortcut({
    altKey: false,
    ctrlKey: false,
    key: "k",
    metaKey: false,
    shiftKey: false,
    ...overrides,
  });
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
