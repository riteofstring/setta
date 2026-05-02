// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest";
import {
  type DndModeSnapshot,
  type DndSource,
  getSectionDndActivatorElements,
  shouldPreventSectionDndActivation,
} from "./dndSensorActivation";
import {
  setSelectionDragHandle,
  setSelectionDragPrimaryId,
} from "./selectionDragHandle";

const MOVING_FREE: DndModeSnapshot = {
  isMovingFree: true,
  isSorting: false,
};
const SORTING: DndModeSnapshot = {
  isMovingFree: false,
  isSorting: true,
};
const NORMAL: DndModeSnapshot = {
  isMovingFree: false,
  isSorting: false,
};

describe("section dnd sensor ownership", () => {
  afterEach(() => {
    setSelectionDragHandle(null);
    setSelectionDragPrimaryId(null);
    document.body.replaceChildren();
  });

  it("allows section dnd only in active dnd modes", () => {
    // Validates normal-mode pointer gestures stay with GPU pan/selection/node drag.
    const source = sectionSource({ isTopLevel: true });
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(source.element!),
        source,
        NORMAL,
      ),
    ).toBe(true);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(source.element!),
        source,
        MOVING_FREE,
      ),
    ).toBe(false);
  });

  it("allows nested section sorting but blocks top-level section sorting", () => {
    // Validates sorting mode is scoped to child sections, matching section-dnd ownership.
    const childSource = sectionSource({ isTopLevel: false });
    const topLevelSource = sectionSource({ isTopLevel: true });

    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(childSource.element!),
        childSource,
        SORTING,
      ),
    ).toBe(false);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(topLevelSource.element!),
        topLevelSource,
        SORTING,
      ),
    ).toBe(true);
  });

  it("blocks nodrag controls before active dnd mode checks", () => {
    // Validates interactive controls keep first-pointer ownership in sorting and moving-free modes.
    const source = sectionSource({ isTopLevel: false });
    const control = document.createElement("button");
    control.className = "nodrag";
    source.element.append(control);

    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(control),
        source,
        SORTING,
      ),
    ).toBe(true);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(control),
        source,
        MOVING_FREE,
      ),
    ).toBe(true);
  });

  it("allows dnd when the draggable section root carries nodrag for GPU drag blocking", () => {
    // Validates the section wrapper can block GPU node movement without blocking its own dnd handle.
    const source = sectionSource({ isTopLevel: false });
    source.element!.className = "nodrag";
    const body = document.createElement("div");
    source.element!.append(body);

    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(body),
        source,
        SORTING,
      ),
    ).toBe(false);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(body),
        source,
        MOVING_FREE,
      ),
    ).toBe(false);
  });

  it("allows dnd when an inner root wrapper carries nodrag for GPU drag blocking", () => {
    // Mirrors the live GPU DOM: dnd-kit owns the sortable wrapper while the section root wrapper owns nodrag.
    const source = sectionSource({ isTopLevel: false });
    const gpuDragBlocker = document.createElement("div");
    gpuDragBlocker.className = "nodrag";
    const section = document.createElement("section");
    section.dataset.sectionId = String(source.id);
    const title = document.createElement("p");
    section.append(title);
    gpuDragBlocker.append(section);
    source.element!.append(gpuDragBlocker);

    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(title),
        source,
        SORTING,
      ),
    ).toBe(false);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(title),
        source,
        MOVING_FREE,
      ),
    ).toBe(false);
  });

  it("rejects non-section sources so param dnd stays isolated", () => {
    // Validates section sensors never claim nested param drags, even while section dnd modes are active.
    const source = dndSource({ type: "param", isTopLevel: false });

    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(source.element!),
        source,
        SORTING,
      ),
    ).toBe(true);
    expect(
      shouldPreventSectionDndActivation(
        eventFromElement(source.element!),
        source,
        MOVING_FREE,
      ),
    ).toBe(true);
  });

  it("adds the selected-nodes rectangle as an activator for the primary section", () => {
    // Validates moving-free multi-selection drags can start from the selection rectangle.
    const source = sectionSource({ id: "primary", isTopLevel: true });
    const handle = document.createElement("div");
    setSelectionDragPrimaryId("primary");
    setSelectionDragHandle(handle);

    expect(getSectionDndActivatorElements(source)).toEqual([
      source.element,
      handle,
    ]);
  });

  it("does not attach the selected-nodes rectangle to non-primary sections", () => {
    const source = sectionSource({ id: "secondary", isTopLevel: true });
    const handle = document.createElement("div");
    setSelectionDragPrimaryId("primary");
    setSelectionDragHandle(handle);

    expect(getSectionDndActivatorElements(source)).toEqual([source.element]);
  });
});

function sectionSource({
  id = "section-1",
  isTopLevel,
}: {
  readonly id?: string;
  readonly isTopLevel: boolean;
}): DndSource {
  return dndSource({ id, type: "section", isTopLevel });
}

function dndSource({
  id = "source-1",
  isTopLevel,
  type,
}: {
  readonly id?: string;
  readonly isTopLevel: boolean;
  readonly type: string;
}): DndSource {
  const element = document.createElement("div");
  document.body.append(element);
  return {
    id,
    element,
    data: {
      current: {
        isTopLevel,
        type,
      },
    },
  };
}

function eventFromElement(target: Element): Event {
  const event = new Event("pointerdown", { bubbles: true });
  Object.defineProperty(event, "target", {
    configurable: true,
    value: target,
  });
  return event;
}
