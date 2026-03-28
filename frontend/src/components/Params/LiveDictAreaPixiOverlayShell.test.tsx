/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaMountBoundary } from "./groupContainerLiveDictAreaMountBoundary";
import { LiveDictAreaPixiOverlayShell } from "./LiveDictAreaPixiOverlayShell";

vi.mock("./LiveDictAreaPixiScene", () => ({
  LiveDictAreaPixiScene: () => <div data-live-dict-area-scene="pixi" />,
}));

vi.mock("./groupContainerLiveDictAreaMount", () => ({
  LiveDictAreaMount: () => (
    <div data-live-dict-area-editor-overlay-content="mounted" />
  ),
}));

describe("LiveDictAreaPixiOverlayShell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("mounts the DOM editor overlay on demand over the Pixi scene canary", () => {
    const liveDictAreaMountBoundary = buildLiveDictAreaMountBoundary({
      input: {
        bgColor: "bg-transparent",
        canConnect: true,
        edgeInputParams: [],
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-value": "Pinned Value",
              "unpinned-group": "Unpinned Group",
              "unpinned-value": "Unpinned Value",
            }) as Record<string, string>
          )[paramId] ?? paramId,
        handleColumnResizeStart: vi.fn(),
        hideUnpinnedParams: false,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        paramFilter: "",
        pinned: {
          requiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          topLevelParamIds: ["pinned-group"],
        },
        positionAndSizeLocked: false,
        sectionId: "section-1",
        sectionTypeName: SectionTypeEnum.Dict,
        selectedParamIds: [],
        styleColor: null,
        unpinned: {
          canEditLayout: true,
          configuredMinHeight: 80,
          pinnedRequiredParamIdsToPaths: {
            "pinned-value": ["pinned-group", "pinned-value"],
          },
          pinnedTopLevelParamIds: ["pinned-group"],
          positionAndSizeLocked: false,
          requiredParamIdsToPaths: {
            "unpinned-value": ["unpinned-group", "unpinned-value"],
          },
          topLevelParamIds: ["unpinned-group"],
        },
      },
    });

    act(() => {
      root.render(
        <LiveDictAreaPixiOverlayShell
          liveDictAreaMountProps={
            liveDictAreaMountBoundary.liveDictAreaMountProps
          }
          liveDictAreaSceneBoundary={
            liveDictAreaMountBoundary.liveDictAreaSceneBoundary
          }
        />,
      );
    });

    expect(
      container.querySelector("[data-live-dict-area-scene='pixi']"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-handoff='available']",
      ),
    ).not.toBeNull();
    expect(
      container.querySelector("[data-live-dict-area-editor-overlay='active']"),
    ).toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          "[data-live-dict-area-editor-handoff='available']",
        )
        ?.click();
    });

    expect(
      container.querySelector(
        "[data-live-dict-area-editor-handoff='available']",
      ),
    ).toBeNull();
    expect(
      container.querySelector("[data-live-dict-area-editor-overlay='active']"),
    ).not.toBeNull();
    expect(
      container.querySelector(
        "[data-live-dict-area-editor-overlay-content='mounted']",
      ),
    ).not.toBeNull();
  });
});
