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
  it("keeps snapshots sorted by z-index and narrower hit boxes", () => {
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
  });

  it("resolves overlapping hits to the nearest activator center", () => {
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

    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        x: 25,
        y: 18,
      }),
    ).toMatchObject({
      sectionId: "section-a",
      targetId: "narrow-target",
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

  it("prefers the nearest activator center over a higher-z overlapping fallback", () => {
    replaceCanvasOwnedTextActivators([
      {
        height: 116.99996948242188,
        sectionId: "settings-section__chatSectionDefault",
        targetId:
          "settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode-ParamInput",
        width: 3.203125,
        x: 92.9998779296875,
        y: 2469.0000915527344,
        zIndex: 9,
      },
      {
        height: 37.0001220703125,
        sectionId: "settings-section__drawSectionDefault",
        targetId:
          "settings-section__drawSectionDefault-settings-codeobj__drawSectionDefault__drawSectionDefault__activeLayerIdx-ParamInput",
        width: 1.818115234375,
        x: 94.11279296875,
        y: 2513.500015258789,
        zIndex: 12,
      },
    ]);

    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        x: 94.6014404296875,
        y: 2527.5000762939453,
      }),
    ).toMatchObject({
      sectionId: "settings-section__chatSectionDefault",
      targetId:
        "settings-section__chatSectionDefault-settings-codeobj__chatSectionDefault__chatSectionDefault__permissionMode-ParamInput",
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

  it("expands tiny activators to a minimum screen-space hit size when requested", () => {
    replaceCanvasOwnedTextActivators([
      {
        height: 69,
        sectionId: "section-a",
        targetId: "tiny-target",
        width: 3.2,
        x: 93,
        y: 1338,
        zIndex: 6,
      },
    ]);

    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        minimumScreenHitSizePx: 1,
        viewportScale: 0.1,
        x: 91,
        y: 1368,
      }),
    ).toMatchObject({
      sectionId: "section-a",
      targetId: "tiny-target",
    });
    expect(
      resolveCanvasOwnedTextActivatorAtGraphPoint({
        x: 91,
        y: 1368,
      }),
    ).toBeNull();
  });
});
