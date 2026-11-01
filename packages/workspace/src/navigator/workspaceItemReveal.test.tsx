/* @vitest-environment jsdom */
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ItemDndContext } from "../dnd/ItemDndContext.js";
import { registerSectionKinds } from "../document/sectionKindRegistry.js";
import { getWorkspaceDocumentStore } from "../document/stores.js";
import {
  registerItemListView,
  unregisterItemListView,
} from "../items/itemListRegistry.js";
import { WorkspaceItemList } from "../items/WorkspaceItemList.js";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost.js";
import { WorkspaceProvider } from "../workspaceHostContext.js";
import {
  getWorkspaceItemRevealAvailability,
  registerWorkspaceItemRevealTarget,
  revealWorkspaceItem,
  useWorkspaceItemRevealTarget,
} from "./workspaceItemReveal.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let alpha: WorkspaceHost;
let beta: WorkspaceHost;

beforeEach(() => {
  alpha = createWorkspaceHost();
  beta = createWorkspaceHost();
});

afterEach(() => {
  registerSectionKinds(alpha, {});
  registerSectionKinds(beta, {});
  alpha.dispose();
  beta.dispose();
  vi.useRealTimers();
});

describe("workspace item reveal registry", () => {
  it("reveals a mounted target within its owning host and applies transient emphasis", () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    const scrollIntoView = vi.fn();
    const focus = vi.spyOn(element, "focus");
    Object.defineProperty(element, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });
    document.body.appendChild(element);
    const unregister = registerWorkspaceItemRevealTarget(
      alpha,
      "section",
      "item",
      element,
    );

    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "item"),
    ).toEqual({ canReveal: true, statusMessage: null });
    expect(revealWorkspaceItem(alpha, "section", "item")).toEqual({
      revealed: true,
      statusMessage: null,
    });
    expect(scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(element.getAttribute("data-setta-workspace-item-reveal")).toBe(
      "true",
    );

    vi.advanceTimersByTime(1_500);
    expect(element.hasAttribute("data-setta-workspace-item-reveal")).toBe(
      false,
    );

    unregister();
    element.remove();
  });

  it("does not cross hosts and explains a filtered or unmounted item", () => {
    const element = document.createElement("div");
    document.body.appendChild(element);
    const unregister = registerWorkspaceItemRevealTarget(
      alpha,
      "section",
      "item",
      element,
    );
    registerItemListView(beta, "section", {
      filterActive: true,
      listKey: "main",
      topLevelItemIds: ["visible"],
      visibleItemIds: new Set(["visible"]),
    });

    expect(getWorkspaceItemRevealAvailability(beta, "section", "item")).toEqual(
      {
        canReveal: false,
        statusMessage: "This item is hidden by the section filter.",
      },
    );
    expect(revealWorkspaceItem(beta, "section", "item")).toEqual({
      revealed: false,
      statusMessage: "This item is hidden by the section filter.",
    });
    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "other"),
    ).toEqual({
      canReveal: false,
      statusMessage: "This item is not mounted in this workspace view.",
    });

    unregisterItemListView(beta, "section", "main");
    unregister();
    element.remove();
  });

  it("cleans reveal state when its host is disposed", () => {
    vi.useFakeTimers();
    const element = document.createElement("div");
    document.body.appendChild(element);
    const unregister = registerWorkspaceItemRevealTarget(
      alpha,
      "section",
      "item",
      element,
    );
    revealWorkspaceItem(alpha, "section", "item");

    alpha.dispose();

    expect(element.hasAttribute("data-setta-workspace-item-reveal")).toBe(
      false,
    );
    expect(() => unregister()).not.toThrow();
    element.remove();
  });

  it("registers and unregisters mounted React targets within their host", async () => {
    let alphaRoot: Root;
    let betaRoot: Root;
    const alphaElement = document.createElement("div");
    const betaElement = document.createElement("div");
    document.body.append(alphaElement, betaElement);
    alphaRoot = createRoot(alphaElement);
    betaRoot = createRoot(betaElement);

    await act(async () => {
      alphaRoot.render(
        createElement(
          WorkspaceProvider,
          { host: alpha },
          createElement(RevealTarget, { itemId: "item", sectionId: "section" }),
        ),
      );
      betaRoot.render(
        createElement(
          WorkspaceProvider,
          { host: beta },
          createElement(RevealTarget, { itemId: "item", sectionId: "section" }),
        ),
      );
    });

    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "item").canReveal,
    ).toBe(true);
    expect(
      getWorkspaceItemRevealAvailability(beta, "section", "item").canReveal,
    ).toBe(true);

    await act(async () => {
      alphaRoot.unmount();
    });

    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "item").canReveal,
    ).toBe(false);
    expect(
      getWorkspaceItemRevealAvailability(beta, "section", "item").canReveal,
    ).toBe(true);

    await act(async () => {
      betaRoot.unmount();
    });
    alphaElement.remove();
    betaElement.remove();
  });

  it("registers the ItemRow element and releases it on unmount", async () => {
    registerSectionKinds(alpha, {
      parameters: {
        itemArea: { toolbar: "hidden" },
        renderContent: () => null,
      },
    });
    getWorkspaceDocumentStore(alpha).setState({
      parentSectionMap: {},
      sections: {
        section: {
          children: [],
          id: "section",
          isHorizontalOrientation: false,
          isMinimized: false,
          itemTree: {
            items: {
              item: { children: [], data: {}, id: "item" },
              root: { children: ["item"], id: "root" },
            },
            rootId: "root",
            selectedItemIds: [],
          },
          kind: "parameters",
          name: "Parameters",
          overflowMode: false,
          positionAndSizeLocked: false,
          size: { height: 120, width: 240 },
          styleColor: null,
          tagColor: null,
        },
      },
      topLevelSections: {
        section: { h: 120, w: 240, x: 0, y: 0, zIndex: 0 },
      },
      viewport: null,
      savedViews: null,
    });
    const element = document.createElement("div");
    document.body.appendChild(element);
    const root = createRoot(element);

    await act(async () => {
      root.render(
        createElement(
          WorkspaceProvider,
          { host: alpha },
          createElement(
            ItemDndContext,
            null,
            createElement(WorkspaceItemList, {
              listKey: "main",
              renderItem: () => null,
              sectionId: "section",
              topLevelItemIds: ["item"],
            }),
          ),
        ),
      );
    });

    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "item").canReveal,
    ).toBe(true);

    await act(async () => {
      root.unmount();
    });

    expect(
      getWorkspaceItemRevealAvailability(alpha, "section", "item").canReveal,
    ).toBe(false);
    element.remove();
  });
});

function RevealTarget({
  itemId,
  sectionId,
}: {
  itemId: string;
  sectionId: string;
}) {
  const ref = useWorkspaceItemRevealTarget(sectionId, itemId);
  return <div ref={ref} />;
}
