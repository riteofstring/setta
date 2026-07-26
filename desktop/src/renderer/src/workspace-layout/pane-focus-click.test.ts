import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  paneFocusHitContainsPoint,
  paneFocusHitRevealsPane,
  paneFocusTargetFromClick,
} from "./pane-focus-click";

const rect = {
  bottom: 260,
  left: 100,
  right: 420,
  top: 40,
};

describe("workspace pane focus click zones", () => {
  beforeEach(() => {
    vi.stubGlobal("Element", FakeElement);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("accepts all interior pane hits for focus routing", () => {
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 52 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 160 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 108, y: 160 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 414, y: 160 })).toBe(true);
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 254 })).toBe(true);
  });

  test("rejects outside points", () => {
    expect(paneFocusHitContainsPoint(rect, { x: 220, y: 36 })).toBe(false);
    expect(paneFocusHitContainsPoint(rect, { x: 96, y: 52 })).toBe(false);
  });

  test("reveals only top strip hits", () => {
    expect(paneFocusHitRevealsPane(rect, { x: 220, y: 52 })).toBe(true);
    expect(paneFocusHitRevealsPane(rect, { x: 220, y: 160 })).toBe(false);
    expect(paneFocusHitRevealsPane(rect, { x: 108, y: 160 })).toBe(false);
    expect(paneFocusHitRevealsPane(rect, { x: 414, y: 160 })).toBe(false);
    expect(paneFocusHitRevealsPane(rect, { x: 220, y: 254 })).toBe(false);
    expect(paneFocusHitRevealsPane(rect, { x: 220, y: 36 })).toBe(false);
  });

  test("resolves the clicked pane from pointer coordinates instead of focus state", () => {
    const conversationHost = new FakeElement({ rect });
    conversationHost.dataset.paneId = "conversation-pane";
    const conversationContent = new FakeElement({ closestHost: conversationHost });
    const ownerDocument = fakeDocument({
      elementsAtPoint: [conversationContent],
      hosts: [conversationHost],
    });
    const root = new FakeElement({ ownerDocument });
    const event = mouseEvent({
      clientX: 220,
      clientY: 160,
      currentTarget: root,
      target: {},
    });

    expect(paneFocusTargetFromClick(event)).toEqual({
      paneId: "conversation-pane",
      reveal: false,
    });
  });

  test("falls back to visible pane rects when the point stack is unavailable", () => {
    const conversationHost = new FakeElement({ rect });
    conversationHost.dataset.paneId = "conversation-pane";
    const ownerDocument = fakeDocument({
      elementsAtPoint: [],
      hosts: [conversationHost],
    });
    const root = new FakeElement({ ownerDocument });
    const event = mouseEvent({
      clientX: 220,
      clientY: 52,
      currentTarget: root,
      target: {},
    });

    expect(paneFocusTargetFromClick(event)).toEqual({
      paneId: "conversation-pane",
      reveal: true,
    });
  });
});

function fakeDocument({
  elementsAtPoint,
  hosts,
}: {
  elementsAtPoint: FakeElement[];
  hosts: FakeElement[];
}) {
  return {
    elementsFromPoint: vi.fn(() => elementsAtPoint),
    querySelectorAll: vi.fn(() => hosts),
  } as unknown as Document;
}

function mouseEvent({
  clientX,
  clientY,
  currentTarget,
  target,
}: {
  clientX: number;
  clientY: number;
  currentTarget: FakeElement;
  target: unknown;
}): MouseEvent {
  return {
    clientX,
    clientY,
    currentTarget,
    target,
  } as unknown as MouseEvent;
}

class FakeElement {
  readonly dataset: Record<string, string> = {};
  readonly ownerDocument: Document;

  constructor(
    private readonly options: {
      closestHost?: FakeElement;
      ownerDocument?: Document;
      rect?: { bottom: number; left: number; right: number; top: number };
    } = {},
  ) {
    this.ownerDocument = options.ownerDocument ?? ({} as Document);
  }

  closest(selector: string): FakeElement | null {
    if (
      selector === '[data-testid="workspace-pane-host"][data-visible="true"]' &&
      this.options.closestHost
    ) {
      return this.options.closestHost;
    }
    return null;
  }

  getBoundingClientRect(): { bottom: number; left: number; right: number; top: number } {
    return this.options.rect ?? { bottom: 0, left: 0, right: 0, top: 0 };
  }
}
