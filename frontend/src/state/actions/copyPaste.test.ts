/* @vitest-environment jsdom */

import initialState from "forks/xyflow/core/store/initialState";
import { useReactFlow } from "forks/xyflow/core/store";
import { setActiveSectionUIIds } from "state/activeSectionUI";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import { createCore } from "utils/generatedTypes";
import * as endpoints from "utils/generatedEndpoints";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { paste } from "./copyPaste";

describe("paste", () => {
  const originalClipboard = navigator.clipboard;

  beforeEach(() => {
    resetProjectStores();
    useReactFlow.setState({ ...initialState });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn().mockResolvedValue(
          JSON.stringify({
            type: "Sections",
            data: {
              core: {
                id: "clipboard-core",
              },
              sectionVariantMap: {},
            },
          }),
        ),
      },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setActiveSectionUIIds([]);
    useReactFlow.setState({ ...initialState });
    resetProjectStores();
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: originalClipboard,
    });
  });

  it("uses top-level canvas-engine layout when paste computes the active selection offset", async () => {
    useProjectState.setState((state) => {
      state.sections["section-a"] = createCore({ id: "section-a" });
      state.projectConfig.topLevelSections["section-a"] = {
        x: 120,
        y: 80,
        zIndex: 0,
        w: 240,
        h: 140,
      };
    });
    setActiveSectionUIIds(["section-a"]);
    const routePasteSectionsSpy = vi
      .spyOn(endpoints, "route_paste_sections")
      .mockResolvedValue({
        data: null,
        status: 200,
        hasResponse: true,
      });

    await paste({});

    expect(routePasteSectionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { x: 360, y: 80 },
      }),
    );
  });

  it("uses cached nested preview geometry when paste computes the active selection offset", async () => {
    useProjectState.setState((state) => {
      state.sections["group-a"] = createCore({ id: "group-a" });
      state.sections["nested-a"] = createCore({ id: "nested-a" });
      state.projectConfig.topLevelSections["group-a"] = {
        x: 400,
        y: 80,
        zIndex: 0,
        w: 360,
        h: 260,
      };
    });
    useReactFlow.setState({
      canvasEngineNestedPreviewRects: [
        {
          id: "nested-a",
          parentSectionId: "group-a",
          x: 440,
          y: 120,
          width: 180,
          height: 100,
          isActive: false,
          color: [0.15, 0.18, 0.22],
        },
      ],
    });
    setActiveSectionUIIds(["nested-a"]);
    const routePasteSectionsSpy = vi
      .spyOn(endpoints, "route_paste_sections")
      .mockResolvedValue({
        data: null,
        status: 200,
        hasResponse: true,
      });

    await paste({});

    expect(routePasteSectionsSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        position: { x: 620, y: 120 },
      }),
    );
  });
});
