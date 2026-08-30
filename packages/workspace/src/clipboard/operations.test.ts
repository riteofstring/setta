/* @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getWorkspaceHistoryState,
  undoWorkspace,
} from "../history/workspaceHistory";
import { registerSectionKinds } from "../document/sectionKindRegistry";
import type {
  WorkspaceDocument,
  WorkspaceItem,
  WorkspaceSection,
} from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceClipboardAuthority } from "./registry";
import {
  copyWorkspaceSelection,
  duplicateWorkspaceSelection,
  getWorkspaceClipboardAvailability,
  pasteWorkspaceClipboard,
} from "./operations";

type ClipboardMock = {
  readText: ReturnType<typeof vi.fn<() => Promise<string>>>;
  writeText: ReturnType<typeof vi.fn<(text: string) => Promise<void>>>;
};

const hosts: Array<WorkspaceHost> = [];
const originalClipboard = Object.getOwnPropertyDescriptor(
  navigator,
  "clipboard",
);

function ownHost(host: WorkspaceHost): WorkspaceHost {
  hosts.push(host);
  registerSectionKinds(host, {
    leaf: { nestedSections: "vertical", renderContent: () => null },
  });
  return host;
}

function createItem(id: string, data: Record<string, string>): WorkspaceItem {
  return { children: [], data, id };
}

function createSection(
  id: string,
  overrides: Partial<WorkspaceSection> = {},
): WorkspaceSection {
  return {
    children: [],
    id,
    isHorizontalOrientation: false,
    isMinimized: false,
    kind: "leaf",
    name: id,
    overflowMode: false,
    positionAndSizeLocked: false,
    size: { height: 80, width: 160 },
    styleColor: null,
    tagColor: null,
    ...overrides,
  };
}

function createDocument(): WorkspaceDocument {
  return {
    activeIds: ["group"],
    sections: {
      child: createSection("child", {
        data: { value: "source" },
        itemTree: {
          items: {
            item: createItem("item", { value: "item-source" }),
            root: { children: ["item"], id: "root" },
          },
          rootId: "root",
          selectedItemIds: ["item"],
        },
      }),
      group: createSection("group", {
        children: ["child"],
        kind: "group",
      }),
      other: createSection("other"),
    },
    topLevelSections: {
      group: { h: 80, w: 160, x: 10, y: 20, zIndex: 0 },
      other: { h: 80, w: 160, x: 280, y: 20, zIndex: 1 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

function installClipboard(initialText = ""): {
  clipboard: ClipboardMock;
  getText: () => string;
  setText: (value: string) => void;
} {
  let text = initialText;
  const clipboard: ClipboardMock = {
    readText: vi.fn(async () => text),
    writeText: vi.fn(async (next) => {
      text = next;
    }),
  };
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: clipboard,
  });
  return {
    clipboard,
    getText: () => text,
    setText: (value) => {
      text = value;
    },
  };
}

function restoreClipboard(): void {
  if (originalClipboard) {
    Object.defineProperty(navigator, "clipboard", originalClipboard);
    return;
  }
  Reflect.deleteProperty(navigator, "clipboard");
}

afterEach(() => {
  restoreClipboard();
  for (const host of hosts.splice(0)) {
    host.dispose();
  }
});

describe("workspace section clipboard operations", () => {
  it("copies and locally pastes one complete subtree in one history transaction", async () => {
    const host = ownHost(createWorkspaceHost({ history: { kind: "local" } }));
    host.loadDocument(createDocument());
    const browser = installClipboard();
    const observed: Array<WorkspaceDocument> = [];
    host.subscribe((document) => observed.push(document));
    const sectionCloneContexts: Array<string | undefined> = [];
    const itemCloneContexts: Array<string | undefined> = [];
    registerWorkspaceClipboardAuthority(host, {
      cloneItemData: (source, context) => {
        itemCloneContexts.push(
          context.itemIdsBySection.get("child")?.get("item"),
        );
        expect(source).toEqual({ value: "item-source" });
        return { clonedItemId: context.sourceItemId, value: "item-source" };
      },
      cloneSectionData: (source, context) => {
        sectionCloneContexts.push(context.sectionIds.get("child"));
        expect(source).toEqual({ value: "source" });
        return { clonedSectionId: context.sourceSectionId, value: "source" };
      },
      id: "local-test",
      kind: "local",
    });

    expect(await copyWorkspaceSelection(host)).toEqual({
      rootIds: ["group"],
      status: "copied",
    });
    expect(browser.clipboard.writeText).toHaveBeenCalledOnce();
    expect(JSON.parse(browser.getText())).toMatchObject({
      authority: { id: "local-test", payloadVersion: 1 },
      fragment: { roots: ["group"] },
      schema: "setta.workspace.section-clipboard",
      version: 1,
    });

    expect(await pasteWorkspaceClipboard(host)).toEqual({
      rootIds: ["group-copy"],
      status: "pasted",
    });
    const snapshot = host.getSnapshot();
    expect(snapshot.topLevelSections["group-copy"]).toEqual({
      h: 80,
      w: 160,
      x: 210,
      y: 20,
      zIndex: 2,
    });
    expect(snapshot.sections["group-copy"]?.children).toEqual(["child-copy"]);
    expect(snapshot.sections["child-copy"]?.data).toEqual({
      clonedSectionId: "child",
      value: "source",
    });
    expect(snapshot.sections["child-copy"]?.itemTree).toMatchObject({
      rootId: "root-copy",
      selectedItemIds: ["item-copy"],
      items: {
        "item-copy": {
          data: { clonedItemId: "item", value: "item-source" },
          id: "item-copy",
        },
        "root-copy": { children: ["item-copy"], id: "root-copy" },
      },
    });
    expect(sectionCloneContexts).toEqual(["child-copy"]);
    expect(itemCloneContexts).toEqual(["item-copy"]);
    expect(observed).toHaveLength(1);
    expect(getWorkspaceHistoryState(host).canUndo).toBe(true);
    expect(undoWorkspace(host)).toBe(true);
    expect(host.getSnapshot().sections["group-copy"]).toBeUndefined();
  });

  it("keeps delegated copy and duplicate authority-owned without speculative publication", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    const prepareCopy = vi.fn(async () => ({ status: "domain-payload" }));
    const paste = vi.fn(async () => ({ rootIds: ["accepted-root"] }));
    registerWorkspaceClipboardAuthority(host, {
      id: "delegated-test",
      kind: "delegated",
      paste,
      payloadVersion: 3,
      prepareCopy,
    });

    expect(await duplicateWorkspaceSelection(host)).toEqual({
      rootIds: ["accepted-root"],
      status: "duplicated",
    });
    expect(prepareCopy).toHaveBeenCalledOnce();
    expect(paste).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: { status: "domain-payload" },
        payloadVersion: 3,
        rootIds: ["group"],
      }),
    );
    expect(host.getSnapshot()).toEqual(createDocument());
  });

  it("rejects unavailable copy paths and invalid external clipboard input without publication", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    const browser = installClipboard("{} ");
    registerWorkspaceClipboardAuthority(host, {
      id: "local-test",
      kind: "local",
    });

    expect(await pasteWorkspaceClipboard(host)).toEqual({
      code: "unsupported-schema",
      status: "failed",
    });
    expect(host.getSnapshot()).toEqual(createDocument());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
    expect(await copyWorkspaceSelection(host)).toEqual({
      reason: "clipboard-unavailable",
      status: "declined",
    });
    expect(browser.clipboard.readText).toHaveBeenCalledOnce();
  });

  it("serializes concurrent operations and discards a delegated completion after disposal", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    const deferredPaste: {
      resolve: ((value: { rootIds: Array<string> }) => void) | null;
    } = { resolve: null };
    registerWorkspaceClipboardAuthority(host, {
      id: "delegated-test",
      kind: "delegated",
      paste: () =>
        new Promise((resolve) => {
          deferredPaste.resolve = resolve;
        }),
      payloadVersion: 1,
      prepareCopy: async () => ({ copied: true }),
    });

    const first = duplicateWorkspaceSelection(host);
    expect(getWorkspaceClipboardAvailability(host).pending).toBe(true);
    expect(await duplicateWorkspaceSelection(host)).toEqual({
      reason: "operation-pending",
      status: "declined",
    });
    host.dispose();
    const resolvePaste = deferredPaste.resolve;
    if (!resolvePaste) {
      throw new Error("Expected the delegated paste to begin.");
    }
    resolvePaste({ rootIds: ["accepted-root"] });
    expect(await first).toEqual({ reason: "disposed", status: "declined" });
  });
});
