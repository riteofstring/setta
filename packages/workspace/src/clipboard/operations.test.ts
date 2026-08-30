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
  WorkspaceSectionItemTree,
} from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import { registerWorkspaceClipboardAuthority } from "./registry";
import {
  WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES,
  WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT,
  type WorkspaceClipboardAuthority,
  type WorkspaceClipboardCopyabilityRequest,
  type WorkspaceClipboardPasteRequest,
  type WorkspaceClipboardPrepareCopyRequest,
} from "./types";
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

function createMinimalItemTree(itemCount: number): WorkspaceSectionItemTree {
  const root: WorkspaceItem = { children: [], id: "root" };
  const items: Record<string, WorkspaceItem> = { root };
  for (let index = 0; index < itemCount; index += 1) {
    const id = `item-${index}`;
    root.children.push(id);
    items[id] = { children: [], id };
  }
  return { items, rootId: "root", selectedItemIds: [] };
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
    savedViews: null,
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
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(source)).toBe(true);
        expect(() => {
          (context.sectionIds as unknown as Map<string, string>).set(
            "child",
            "corrupted",
          );
        }).toThrow();
        expect(() => {
          (context.itemIdsBySection.get("child") as Map<string, string>).set(
            "item",
            "corrupted",
          );
        }).toThrow();
        expect(source).toEqual({ value: "item-source" });
        return { clonedItemId: context.sourceItemId, value: "item-source" };
      },
      cloneSectionData: (source, context) => {
        sectionCloneContexts.push(context.sectionIds.get("child"));
        expect(Object.isFrozen(context)).toBe(true);
        expect(Object.isFrozen(source)).toBe(true);
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
    const prepareCopy = vi.fn(
      async (request: WorkspaceClipboardPrepareCopyRequest) => {
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.fragment)).toBe(true);
        expect(Object.isFrozen(request.source)).toBe(true);
        expect(() => {
          (request.fragment.roots as Array<string>).push("injected-root");
        }).toThrow();
        expect(() => {
          (
            request.fragment.sections.group as unknown as { name: string }
          ).name = "mutated";
        }).toThrow();
        return { status: "domain-payload" };
      },
    );
    const paste = vi.fn(async (request: WorkspaceClipboardPasteRequest) => {
      expect(Object.isFrozen(request)).toBe(true);
      expect(Object.isFrozen(request.fragment)).toBe(true);
      expect(Object.isFrozen(request.payload)).toBe(true);
      expect(Object.isFrozen(request.placement)).toBe(true);
      expect(() => {
        (request.placement as { x: number }).x = 999;
      }).toThrow();
      return { rootIds: ["accepted-root"] };
    });
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

  it("lets delegated authorities synchronously decline uncopyable selections", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    installClipboard();
    const canCopySelection = vi.fn(
      (request: WorkspaceClipboardCopyabilityRequest) => {
        expect(Object.isFrozen(request)).toBe(true);
        expect(Object.isFrozen(request.rootIds)).toBe(true);
        expect(() => {
          (request.rootIds as Array<string>).push("injected-root");
        }).toThrow();
        return false;
      },
    );
    const prepareCopy = vi.fn(async () => ({ copied: true }));
    registerWorkspaceClipboardAuthority(host, {
      canCopySelection,
      id: "delegated-test",
      kind: "delegated",
      paste: async () => ({ rootIds: ["accepted-root"] }),
      payloadVersion: 1,
      prepareCopy,
    });

    expect(getWorkspaceClipboardAvailability(host).copy).toEqual({
      disabledReason:
        "The selected sections cannot be copied by this workspace.",
      enabled: false,
    });
    expect(getWorkspaceClipboardAvailability(host).duplicate).toEqual({
      disabledReason:
        "The selected sections cannot be copied by this workspace.",
      enabled: false,
    });
    expect(await copyWorkspaceSelection(host)).toEqual({
      reason: "selection-not-copyable",
      status: "declined",
    });
    expect(await duplicateWorkspaceSelection(host)).toEqual({
      reason: "selection-not-copyable",
      status: "declined",
    });
    expect(canCopySelection).toHaveBeenCalled();
    expect(prepareCopy).not.toHaveBeenCalled();
  });

  it("keeps the registered authority descriptor independent from caller mutation", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    const originalPrepareCopy = vi.fn(async () => ({ copied: true }));
    const replacementPrepareCopy = vi.fn(async () => ({ copied: false }));
    const authority = {
      id: "stable-authority",
      kind: "delegated" as const,
      paste: async () => ({ rootIds: ["accepted-root"] }),
      payloadVersion: 4,
      prepareCopy: originalPrepareCopy,
    };
    registerWorkspaceClipboardAuthority(host, authority);
    authority.id = "changed-authority";
    authority.payloadVersion = 5;
    authority.prepareCopy = replacementPrepareCopy;

    expect(getWorkspaceClipboardAvailability(host).authority).toEqual({
      id: "stable-authority",
      payloadVersion: 4,
    });
    expect(await duplicateWorkspaceSelection(host)).toEqual({
      rootIds: ["accepted-root"],
      status: "duplicated",
    });
    expect(originalPrepareCopy).toHaveBeenCalledOnce();
    expect(replacementPrepareCopy).not.toHaveBeenCalled();
  });

  it("rejects authority kinds outside the closed registration union", () => {
    const host = ownHost(createWorkspaceHost());

    expect(() =>
      registerWorkspaceClipboardAuthority(host, {
        id: "invalid-authority",
        kind: "other",
        paste: async () => ({ rootIds: ["accepted-root"] }),
        payloadVersion: 1,
        prepareCopy: async () => ({ copied: true }),
      } as unknown as WorkspaceClipboardAuthority),
    ).toThrow("kind must be local or delegated");
  });

  it("rejects oversized outbound clipboard text before writing it", async () => {
    const host = ownHost(createWorkspaceHost());
    host.loadDocument(createDocument());
    const browser = installClipboard();
    registerWorkspaceClipboardAuthority(host, {
      id: "delegated-test",
      kind: "delegated",
      paste: async () => ({ rootIds: ["accepted-root"] }),
      payloadVersion: 1,
      prepareCopy: async () => "x".repeat(WORKSPACE_CLIPBOARD_MAX_TEXT_BYTES),
    });

    expect(await copyWorkspaceSelection(host)).toEqual({
      code: "clipboard-too-large",
      status: "failed",
    });
    expect(browser.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("rejects a local selection above the item limit before cloning or writing", async () => {
    const host = ownHost(createWorkspaceHost());
    const document = createDocument();
    const child = document.sections.child;
    if (!child) {
      throw new Error("Expected the local clipboard fixture child.");
    }
    child.itemTree = createMinimalItemTree(WORKSPACE_CLIPBOARD_MAX_ITEM_COUNT);
    host.loadDocument(document);
    const browser = installClipboard();
    registerWorkspaceClipboardAuthority(host, {
      id: "local-test",
      kind: "local",
    });

    expect(await copyWorkspaceSelection(host)).toEqual({
      code: "clipboard-item-count-exceeded",
      status: "failed",
    });
    expect(await duplicateWorkspaceSelection(host)).toEqual({
      code: "clipboard-item-count-exceeded",
      status: "failed",
    });
    expect(browser.clipboard.writeText).not.toHaveBeenCalled();
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
