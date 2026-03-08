/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { useActiveSectionUI } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectConfigPreview } from "./ProjectConfigPreview";

describe("ProjectConfigPreview", () => {
  beforeEach(() => {
    resetProjectStores();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("renders preview markup from object-mapped top-level sections", () => {
    const project = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: 100, h: 120 },
        sectionB: { x: 240, y: 80, w: 220, h: 180 },
      },
    });

    const markup = renderToStaticMarkup(
      <ProjectConfigPreview topLevelSections={project.topLevelSections} />,
    );

    expect(markup).toContain("<svg");
    expect(markup).toContain('width="200"');
    expect(markup).toContain('height="150"');
  });

  it("keeps static previews out of the live active-section subscription path", async () => {
    const project = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: 100, h: 120 },
        sectionB: { x: 240, y: 80, w: 220, h: 180 },
      },
    });

    const subscribeSpy = vi.spyOn(useActiveSectionUI, "subscribe");
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    try {
      await act(async () => {
        root.render(
          <ProjectConfigPreview topLevelSections={project.topLevelSections} />,
        );
      });

      // Static thumbnails should stay inert and avoid the live minimap-selection store wiring.
      expect(subscribeSpy).not.toHaveBeenCalled();

      const markupBeforeSelectionChange = host.innerHTML;
      await act(async () => {
        useActiveSectionUI.setState({ activeIds: ["sectionA"] });
      });

      expect(host.innerHTML).toBe(markupBeforeSelectionChange);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
