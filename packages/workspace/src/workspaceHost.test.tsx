/* @vitest-environment jsdom */

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceHost,
  registerItemHandlers,
  registerSectionKinds,
  registerWorkspaceCommands,
  registerWorkspaceCreationCommands,
  registerWorkspaceKeyBindings,
  registerWorkspaceToolbarContributions,
  setWorkspaceColorMode,
  useWorkspaceAppearance,
  useWorkspaceHost,
  WorkspaceProvider,
  type WorkspaceDocumentInput,
  type WorkspaceHost,
} from "./index";
import { getCanvasGesturesStore } from "./canvas/gestureState";
import { getWorkspaceOptionsStore } from "./canvas/options";
import { getReactFlowStore } from "./canvas/store";
import { getWorkspaceCommandOrThrow } from "./commands/workspaceCommandRegistry";
import { createPaneCommandContext } from "./commands/workspaceCommandContexts";
import { getWorkspaceCreationCommands } from "./context-menu/creationCommandStore";
import {
  getWorkspaceMenuStateStore,
  publishWorkspaceMenuInvocation,
} from "./context-menu/workspaceMenuState";
import { setActiveSectionIds } from "./document/activeSections";
import { getWorkspaceCapabilitiesStore } from "./document/capabilities";
import {
  getWorkspaceAppearanceStore,
  getWorkspaceDocumentStore,
} from "./document/stores";
import { getDndChildrenStore } from "./dnd/dndChildren";
import { getDndStateStore, setActiveDnd } from "./dnd/dndState";
import { getItemDndStateStore, setItemDndState } from "./dnd/itemDndState";
import {
  getItemHandlerRegistration,
  type WorkspaceItemHandlerRegistration,
} from "./items/itemHandlerRegistry";
import {
  registerItemListView,
  resolveItemListView,
} from "./items/itemListRegistry";
import { getWorkspaceKeyBindings } from "./keybindings/workspaceKeyBindingRegistry";
import { getSectionRefsStore } from "./section/sectionRefs";
import { getResizeEventStore, setSectionResizeEvent } from "./section/resize/resizeEvents";
import { getWorkspaceToolbarContributions } from "./toolbar/workspaceToolbarContributions";
import { enableWorkspaceTooltip, getWorkspaceTooltipStore } from "./tooltip/WorkspaceTooltip";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const SECTION_ID = "shared-section";
const ITEM_ID = "shared-item";

function makeDocument(kind: string, name: string): WorkspaceDocumentInput {
  return {
    sections: {
      [SECTION_ID]: {
        id: SECTION_ID,
        kind,
        name,
        isMinimized: false,
        positionAndSizeLocked: false,
        isHorizontalOrientation: false,
        styleColor: null,
        overflowMode: false,
        tagColor: null,
        children: [],
      },
    },
    topLevelSections: {
      [SECTION_ID]: { x: 0, y: 0, w: 160, h: 80, zIndex: 0 },
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    activeIds: [],
  };
}

function makeItemHandler(kind: "password" | "dropzone"): WorkspaceItemHandlerRegistration {
  if (kind === "password") {
    return {
      kind,
      sectionId: SECTION_ID,
      itemId: ITEM_ID,
      onRevealSavedValue: () => undefined,
    };
  }
  return {
    kind,
    sectionId: SECTION_ID,
    itemId: ITEM_ID,
    onAccepted: () => undefined,
    onRejected: () => undefined,
  };
}

function TestIcon() {
  return null;
}

function HostProbe({ id }: { id: string }) {
  const host = useWorkspaceHost();
  const darkMode = useWorkspaceAppearance((state) => state.darkMode);
  return createElement(
    "output",
    { id },
    `${host.getSnapshot().sections[SECTION_ID]?.name}:${darkMode}`,
  );
}

const renderedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];
const hostsToDispose: Array<WorkspaceHost> = [];

afterEach(() => {
  for (const { root, container } of renderedRoots.splice(0)) {
    act(() => root.unmount());
    container.remove();
  }
  for (const host of hostsToDispose.splice(0)) {
    host.dispose();
  }
});

describe("WorkspaceHost", () => {
  it("requires an explicit provider for host-aware hooks", () => {
    expect(() =>
      renderToStaticMarkup(createElement(HostProbe, { id: "missing-host" })),
    ).toThrow(
      "Workspace components require WorkspaceProvider with a createWorkspaceHost() host.",
    );
  });

  it("isolates overlapping documents, registries, transient state, subscriptions, and providers", () => {
    const alpha = createWorkspaceHost();
    const beta = createWorkspaceHost();
    hostsToDispose.push(alpha, beta);

    registerSectionKinds(alpha, {
      alpha: { renderContent: () => null },
    });
    registerSectionKinds(beta, {
      beta: { renderContent: () => null },
    });
    alpha.loadDocument(makeDocument("alpha", "Alpha"));
    beta.loadDocument(makeDocument("beta", "Beta"));

    registerItemHandlers(alpha, [makeItemHandler("password")]);
    registerItemHandlers(beta, [makeItemHandler("dropzone")]);
    expect(getItemHandlerRegistration(alpha, SECTION_ID, ITEM_ID)?.kind).toBe(
      "password",
    );
    expect(getItemHandlerRegistration(beta, SECTION_ID, ITEM_ID)?.kind).toBe(
      "dropzone",
    );

    registerWorkspaceCommands(alpha, [
      {
        id: "alpha-command",
        label: "Alpha command",
        scope: "pane",
        surfaces: ["toolbar"],
        run: () => undefined,
      },
    ]);
    registerWorkspaceCommands(beta, [
      {
        id: "beta-command",
        label: "Beta command",
        scope: "pane",
        surfaces: ["toolbar"],
        run: () => undefined,
      },
    ]);
    expect(getWorkspaceCommandOrThrow(alpha, "alpha-command").origin).toBe(
      "host",
    );
    expect(() => getWorkspaceCommandOrThrow(alpha, "beta-command")).toThrow(
      "Workspace command beta-command is not registered.",
    );

    registerWorkspaceCreationCommands(alpha, [
      {
        id: "alpha-create",
        label: "Alpha create",
        group: "Alpha",
        createSection: () => makeDocument("alpha", "Created").sections[SECTION_ID]!,
      },
    ]);
    registerWorkspaceCreationCommands(beta, [
      {
        id: "beta-create",
        label: "Beta create",
        group: "Beta",
        createSection: () => makeDocument("beta", "Created").sections[SECTION_ID]!,
      },
    ]);
    expect(getWorkspaceCreationCommands(alpha).map((command) => command.id)).toEqual([
      "alpha-create",
    ]);
    expect(getWorkspaceCreationCommands(beta).map((command) => command.id)).toEqual([
      "beta-create",
    ]);

    registerWorkspaceToolbarContributions(alpha, [
      {
        kind: "command",
        commandId: "alpha-command",
        icon: TestIcon,
        placement: "before-minimap",
      },
    ]);
    registerWorkspaceToolbarContributions(beta, [
      {
        kind: "command",
        commandId: "beta-command",
        icon: TestIcon,
        placement: "before-minimap",
      },
    ]);
    expect(getWorkspaceToolbarContributions(alpha)[0]?.commandId).toBe(
      "alpha-command",
    );
    expect(getWorkspaceToolbarContributions(beta)[0]?.commandId).toBe(
      "beta-command",
    );

    registerWorkspaceKeyBindings(alpha, [
      { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
    ]);
    expect(
      getWorkspaceKeyBindings(alpha).find(
        (binding) => binding.id === "workspace.lock-sections",
      ),
    ).toMatchObject({ chord: "Mod + Alt + L", origin: "host" });
    expect(
      getWorkspaceKeyBindings(beta).find(
        (binding) => binding.id === "workspace.lock-sections",
      )?.origin,
    ).not.toBe("host");

    getWorkspaceCapabilitiesStore(alpha).setState({
      canEditLayout: false,
      canEditStructure: false,
    });
    getWorkspaceOptionsStore(alpha).setState({ snapToGrid: false });
    getReactFlowStore(alpha).setState({ width: 320 });
    getCanvasGesturesStore(alpha).setState({ mouseDownDraggingSection: true });
    getDndChildrenStore(alpha).setState({ x: { root: [SECTION_ID] }, y: {} });
    setActiveDnd(alpha, SECTION_ID, true, 160, 80, null);
    setItemDndState(alpha, { activeId: ITEM_ID });
    getSectionRefsStore(alpha).setState({ withNested: { [SECTION_ID]: null } });
    setSectionResizeEvent(alpha, SECTION_ID, "start");
    enableWorkspaceTooltip(alpha);

    expect(getWorkspaceCapabilitiesStore(beta).getState().canEditLayout).toBe(
      true,
    );
    expect(getWorkspaceOptionsStore(beta).getState().snapToGrid).toBe(true);
    expect(getReactFlowStore(beta).getState().width).toBe(0);
    expect(
      getCanvasGesturesStore(beta).getState().mouseDownDraggingSection,
    ).toBe(false);
    expect(getDndChildrenStore(beta).getState().x).toEqual({
      [SECTION_ID]: [],
    });
    expect(getDndStateStore(beta).getState().activeId).toBeNull();
    expect(getItemDndStateStore(beta).getState().activeId).toBeNull();
    expect(getSectionRefsStore(beta).getState().withNested).toEqual({});
    expect(getResizeEventStore(beta).getState().resizeEvent).toEqual({});
    expect(getWorkspaceTooltipStore(beta).getState().isEnabled).toBe(false);

    registerItemListView(alpha, SECTION_ID, {
      listKey: "alpha-list",
      topLevelItemIds: [ITEM_ID],
      visibleItemIds: new Set([ITEM_ID]),
      filterActive: false,
    });
    registerItemListView(beta, SECTION_ID, {
      listKey: "beta-list",
      topLevelItemIds: [ITEM_ID],
      visibleItemIds: new Set([ITEM_ID]),
      filterActive: false,
    });
    expect(resolveItemListView(alpha, SECTION_ID, ITEM_ID, "alpha-list")?.listKey).toBe(
      "alpha-list",
    );
    expect(resolveItemListView(beta, SECTION_ID, ITEM_ID, "alpha-list")?.listKey).toBe(
      "beta-list",
    );

    const menuOwner = document.createElement("button");
    document.body.appendChild(menuOwner);
    publishWorkspaceMenuInvocation(alpha, {
      kind: "pane",
      clientPoint: { x: 10, y: 10 },
      context: createPaneCommandContext(alpha, { x: 4, y: 8 }),
      direction: "ltr",
      owner: menuOwner,
      workspacePosition: { x: 4, y: 8 },
    });
    expect(getWorkspaceMenuStateStore(alpha).getState().invocation?.kind).toBe(
      "pane",
    );
    expect(getWorkspaceMenuStateStore(beta).getState().invocation).toBeNull();
    menuOwner.remove();

    const observedAlpha: Array<string> = [];
    const observedBeta: Array<string> = [];
    alpha.subscribe((document) => observedAlpha.push(document.activeIds.join(",")));
    beta.subscribe((document) => observedBeta.push(document.activeIds.join(",")));
    setActiveSectionIds(alpha, [SECTION_ID]);
    expect(observedAlpha).toEqual([SECTION_ID]);
    expect(observedBeta).toEqual([]);
    expect(alpha.getSnapshot().activeIds).toEqual([SECTION_ID]);
    expect(beta.getSnapshot().activeIds).toEqual([]);
    expect(getWorkspaceDocumentStore(beta).getState().sections[SECTION_ID]?.name).toBe(
      "Beta",
    );

    setWorkspaceColorMode(alpha, "dark");
    setWorkspaceColorMode(beta, "light");
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    renderedRoots.push({ container, root });
    act(() => {
      root.render(
        createElement(
          "div",
          null,
          createElement(
            WorkspaceProvider,
            { host: alpha },
            createElement(HostProbe, { id: "alpha-probe" }),
          ),
          createElement(
            WorkspaceProvider,
            { host: beta },
            createElement(HostProbe, { id: "beta-probe" }),
          ),
        ),
      );
    });
    expect(container.querySelector("#alpha-probe")?.textContent).toBe(
      "Alpha:true",
    );
    expect(container.querySelector("#beta-probe")?.textContent).toBe(
      "Beta:false",
    );
  });

  it("disposes one host's media-query listener without changing another host", () => {
    const originalMatchMedia = Object.getOwnPropertyDescriptor(window, "matchMedia");
    const queries: Array<{
      emit: (matches: boolean) => void;
      listeners: Set<(event: MediaQueryListEvent) => void>;
      remove: ReturnType<typeof vi.fn>;
    }> = [];
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => {
        const listeners = new Set<(event: MediaQueryListEvent) => void>();
        const remove = vi.fn((_: string, listener: (event: MediaQueryListEvent) => void) => {
          listeners.delete(listener);
        });
        const query = {
          matches: false,
          media: "(prefers-color-scheme: dark)",
          onchange: null,
          addEventListener: (_: string, listener: (event: MediaQueryListEvent) => void) => {
            listeners.add(listener);
          },
          removeEventListener: remove,
        } as unknown as MediaQueryList;
        queries.push({
          listeners,
          remove,
          emit: (matches) => {
            for (const listener of listeners) {
              listener({ matches } as MediaQueryListEvent);
            }
          },
        });
        return query;
      }),
    });

    try {
      const alpha = createWorkspaceHost();
      const beta = createWorkspaceHost();
      hostsToDispose.push(beta);
      setWorkspaceColorMode(alpha, "system");
      setWorkspaceColorMode(beta, "system");
      expect(queries).toHaveLength(2);
      expect(queries[0]?.listeners.size).toBe(1);
      expect(queries[1]?.listeners.size).toBe(1);

      alpha.dispose();
      expect(queries[0]?.listeners.size).toBe(0);
      expect(queries[0]?.remove).toHaveBeenCalledTimes(1);
      expect(queries[1]?.listeners.size).toBe(1);
      expect(() => alpha.getSnapshot()).toThrow(
        "This workspace host has already been disposed.",
      );

      queries[1]?.emit(true);
      expect(getWorkspaceDocumentStore(beta).getState().sections).toEqual({});
      expect(getWorkspaceAppearanceStore(beta).getState().darkMode).toBe(true);
      setWorkspaceColorMode(beta, "light");
      expect(getWorkspaceAppearanceStore(beta).getState().darkMode).toBe(false);
    } finally {
      if (originalMatchMedia) {
        Object.defineProperty(window, "matchMedia", originalMatchMedia);
      } else {
        Reflect.deleteProperty(window, "matchMedia");
      }
    }
  });
});
