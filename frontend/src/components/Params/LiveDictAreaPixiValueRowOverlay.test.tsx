/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LiveDictAreaPixiValueRowOverlay } from "./LiveDictAreaPixiValueRowOverlay";
import type { LiveDictAreaPixiValueRowTarget } from "./liveDictAreaPixiValueRowTargets";

const sceneRowCalls = vi.hoisted(() => [] as LiveDictAreaPixiValueRowTarget[]);

vi.mock("./LiveDictAreaPixiValueOverlaySceneRow", () => ({
  LiveDictAreaPixiValueOverlaySceneRow: ({
    target,
  }: {
    hasSectionStyleTheme: boolean;
    target: LiveDictAreaPixiValueRowTarget;
  }) => {
    sceneRowCalls.push(target);
    return (
      <div
        data-live-dict-area-editor-overlay-row="true"
        data-live-dict-area-editor-overlay-row-id={target.rowId}
      />
    );
  },
}));

describe("LiveDictAreaPixiValueRowOverlay", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    sceneRowCalls.length = 0;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    sceneRowCalls.length = 0;
  });

  it("mounts overlay metadata and delegates row rendering to the direct scene-row boundary", () => {
    const target: LiveDictAreaPixiValueRowTarget = {
      blockId: "pinned",
      handleColumnResizeStart: vi.fn(),
      height: 44,
      label: "Pinned Value",
      listKey: "pinned",
      requiredParamIdsToPaths: {
        "pinned-value": ["pinned-group", "pinned-value"],
      },
      rowId: "pinned-value",
      sectionId: "section-1",
      styleColor: null,
      x: 16,
      y: 24,
    };

    act(() => {
      root.render(
        <LiveDictAreaPixiValueRowOverlay
          editorKind="combobox"
          target={target}
        />,
      );
    });

    const overlay = container.querySelector<HTMLElement>(
      "[data-live-dict-area-editor-overlay='active']",
    );
    expect(overlay).not.toBeNull();
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-kind"),
    ).toBe("value-row");
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-editor-kind"),
    ).toBe("combobox");
    expect(
      overlay?.getAttribute("data-live-dict-area-editor-overlay-row-id"),
    ).toBe("pinned-value");
    expect(sceneRowCalls).toHaveLength(1);
    expect(sceneRowCalls[0]).toMatchObject({
      listKey: "pinned",
      rowId: "pinned-value",
      sectionId: "section-1",
    });
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-overlay-row='true'][data-live-dict-area-editor-overlay-row-id='pinned-value']",
      ),
    ).not.toBeNull();
  });
});
