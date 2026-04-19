import {
  clearCanvasOwnedTextActivators,
  getCanvasOwnedTextActivatorSnapshot,
  replaceCanvasOwnedTextActivators,
  resolveCanvasOwnedTextActivatorAtGraphPoint,
} from "./canvasOwnedTextActivatorRegistry";
import { afterEach, describe, expect, it } from "vitest";

afterEach(() => {
  clearCanvasOwnedTextActivators();
});

describe("canvasOwnedTextActivatorRegistry", () => {
  it("sorts activators by z-index and narrower hit boxes before resolving", () => {
    replaceCanvasOwnedTextActivators([
      {
        height: 20,
        sectionId: "section-a",
        targetId: "wide-target",
        width: 80,
        x: 10,
        y: 10,
        zIndex: 1,
      },
      {
        height: 10,
        sectionId: "section-a",
        targetId: "narrow-target",
        width: 30,
        x: 20,
        y: 15,
        zIndex: 1,
      },
      {
        height: 12,
        sectionId: "section-b",
        targetId: "top-target",
        width: 30,
        x: 20,
        y: 15,
        zIndex: 2,
      },
    ]);

    expect(getCanvasOwnedTextActivatorSnapshot().map((activator) => activator.targetId))
      .toEqual(["top-target", "narrow-target", "wide-target"]);
    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        x: 25,
        y: 18,
      }),
    ).toMatchObject({
      sectionId: "section-b",
      targetId: "top-target",
    });
    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        sectionId: "section-a",
        x: 25,
        y: 18,
      }),
    ).toMatchObject({
      sectionId: "section-a",
      targetId: "narrow-target",
    });
  });

  it("mirrors the current snapshot onto globalThis for live probes", () => {
    replaceCanvasOwnedTextActivators([
      {
        height: 12,
        sectionId: "section-a",
        targetId: "target-a",
        width: 40,
        x: 100,
        y: 200,
        zIndex: 3,
      },
    ]);

    expect(globalThis.__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__).toEqual([
      {
        height: 12,
        sectionId: "section-a",
        targetId: "target-a",
        width: 40,
        x: 100,
        y: 200,
        zIndex: 3,
      },
    ]);

    clearCanvasOwnedTextActivators();

    expect(globalThis.__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__).toEqual([]);
  });

  it("falls back to the global snapshot when the local module instance is empty", () => {
    globalThis.__SETTA_CANVAS_OWNED_TEXT_ACTIVATORS__ = [
      {
        height: 12,
        sectionId: "section-a",
        targetId: "target-a",
        width: 40,
        x: 100,
        y: 200,
        zIndex: 3,
      },
    ];

    expect(getCanvasOwnedTextActivatorSnapshot()).toEqual([
      {
        height: 12,
        sectionId: "section-a",
        targetId: "target-a",
        width: 40,
        x: 100,
        y: 200,
        zIndex: 3,
      },
    ]);
    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        x: 110,
        y: 210,
      }),
    ).toMatchObject({
      sectionId: "section-a",
      targetId: "target-a",
    });
  });
});
