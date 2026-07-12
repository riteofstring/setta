import { conversationPaletteCatalog } from "@generated/backend";
import { describe, expect, test } from "vitest";

import { notifyReactDomSurfaceHostChanged } from "../../workspace-layout/react-dom-surface-events";
import { bindEasyButtonPanePresentation } from "./easy-button-pane-title";

describe("Easy Button pane presentation identity", () => {
  test("moves palette identity with a parked React surface", () => {
    const first = fakePaneHost();
    const second = fakePaneHost();
    const surface = fakeParkedSurface(first.element);
    const release = bindEasyButtonPanePresentation(surface.root, {
      conversationId: "conversation_alpha",
      paletteId: "sky",
      projectionStatus: "ready",
      title: "Alpha topic",
      viewState: "working",
    });

    expectPaneIdentity(first, "conversation_alpha", "sky");
    expect(first.title.textContent).toBe("Alpha topic · working");

    surface.host = null;
    surface.notifyHostChanged();
    expectClearedPaneIdentity(first);

    surface.host = second.element;
    surface.notifyHostChanged();
    expectPaneIdentity(second, "conversation_alpha", "sky");
    expect(second.title.textContent).toBe("Alpha topic · working");

    release();
    expectClearedPaneIdentity(second);
  });

  test("deferred cleanup cannot erase a newer host identity", () => {
    const host = fakePaneHost();
    const alphaSurface = fakeParkedSurface(host.element);
    const betaSurface = fakeParkedSurface(host.element);
    const releaseAlpha = bindEasyButtonPanePresentation(alphaSurface.root, {
      conversationId: "conversation_alpha",
      paletteId: "sky",
      projectionStatus: "ready",
      title: "Alpha topic",
      viewState: "idle",
    });
    const releaseBeta = bindEasyButtonPanePresentation(betaSurface.root, {
      conversationId: "conversation_beta",
      paletteId: "blue",
      projectionStatus: "ready",
      title: "Beta topic",
      viewState: "complete",
    });

    releaseAlpha();
    expectPaneIdentity(host, "conversation_beta", "blue");
    expect(host.title.textContent).toBe("Beta topic · complete");

    releaseBeta();
    expectClearedPaneIdentity(host);
  });

  test("a loading presentation clears identity left by a recycled host", () => {
    const host = fakePaneHost();
    host.element.dataset.conversationId = "conversation_stale";
    host.element.dataset.conversationPalette = "magenta";
    host.element.classList.add("conversation-presentation-identity");
    host.element.style.setProperty(
      "--conversation-accent-dark",
      conversationPaletteCatalog.magenta.dark.conversationAccent,
    );
    const surface = fakeParkedSurface(host.element);

    const release = bindEasyButtonPanePresentation(surface.root, {
      conversationId: "conversation_loading",
      paletteId: null,
      projectionStatus: "loading",
      title: "Easy Button",
      viewState: "idle",
    });

    expectClearedPaneIdentity(host);
    expect(host.title.textContent).toBe("Easy Button · loading");
    release();
  });
});

interface FakePaneHost {
  element: HTMLElement;
  title: { dataset: Record<string, string>; textContent: string; title: string };
}

function fakePaneHost(): FakePaneHost {
  const values = new Map<string, string>();
  const classes = new Set<string>();
  const title = { dataset: {}, textContent: "", title: "" };
  const element = {
    classList: {
      add: (...names: string[]) => names.forEach((name) => classes.add(name)),
      contains: (name: string) => classes.has(name),
      remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
    },
    dataset: {},
    querySelector: (selector: string) => (selector === ".workspace-pane-title" ? title : null),
    style: {
      getPropertyValue: (name: string) => values.get(name) ?? "",
      removeProperty: (name: string) => {
        const previous = values.get(name) ?? "";
        values.delete(name);
        return previous;
      },
      setProperty: (name: string, value: string) => {
        values.set(name, value);
      },
    },
  } as unknown as HTMLElement;
  return { element, title };
}

interface FakeParkedSurface {
  host: HTMLElement | null;
  notifyHostChanged: () => void;
  root: HTMLElement;
}

function fakeParkedSurface(initialHost: HTMLElement | null): FakeParkedSurface {
  const container = new EventTarget();
  const surface: FakeParkedSurface = {
    host: initialHost,
    notifyHostChanged: () => notifyReactDomSurfaceHostChanged(container),
    root: null as unknown as HTMLElement,
  };
  surface.root = {
    closest: (selector: string) => {
      if (selector === ".workspace-react-dom-surface") {
        return container;
      }
      if (selector === '[data-testid="workspace-pane-host"]') {
        return surface.host;
      }
      return null;
    },
  } as unknown as HTMLElement;
  return surface;
}

function expectPaneIdentity(
  host: FakePaneHost,
  conversationId: string,
  paletteId: keyof typeof conversationPaletteCatalog,
): void {
  expect(host.element.dataset.conversationId).toBe(conversationId);
  expect(host.element.dataset.conversationPalette).toBe(paletteId);
  expect(host.element.classList.contains("conversation-presentation-identity")).toBe(true);
  expect(host.element.style.getPropertyValue("--conversation-accent-dark")).toBe(
    conversationPaletteCatalog[paletteId].dark.conversationAccent,
  );
}

function expectClearedPaneIdentity(host: FakePaneHost): void {
  expect(host.element.dataset.conversationId).toBeUndefined();
  expect(host.element.dataset.conversationPalette).toBeUndefined();
  expect(host.element.classList.contains("conversation-presentation-identity")).toBe(false);
  expect(host.element.style.getPropertyValue("--conversation-accent-dark")).toBe("");
}
