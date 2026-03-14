/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import "testUtils/reactRefreshPreamble";
import { createProjectConfig } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  getHomeProjectTopLevelSectionCount,
  HomeSelectedProjectDetails,
} from "./HomeSelectedProjectDetails";

describe("HomeSelectedProjectDetails", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the empty-state prompt when no project is selected", () => {
    act(() => {
      root.render(
        <MemoryRouter>
          <HomeSelectedProjectDetails
            project={null}
            isDefault={false}
            isDeploymentMode={false}
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("No project selected.");
  });

  it("renders the open-project action for authored projects", () => {
    const project = createProjectConfig({
      id: "project-1",
      name: "Project One",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: null, h: null },
      },
    });

    act(() => {
      root.render(
        <MemoryRouter>
          <HomeSelectedProjectDetails
            project={project}
            isDefault={true}
            isDeploymentMode={false}
          />
        </MemoryRouter>,
      );
    });

    expect(container.textContent).toContain("Project One");
    expect(container.textContent).toContain("Default: Yes");
    expect(container.textContent).toContain("Sections: 1");
    const openProjectLink = container.querySelector("a");

    expect(openProjectLink?.textContent).toBe("Open Project");
    expect(openProjectLink?.getAttribute("href")).toContain("Project One");
  });

  it("counts top-level sections from object keys", () => {
    const project = createProjectConfig({
      id: "project-1",
      topLevelSections: {
        sectionA: { x: 0, y: 0, w: null, h: null },
        sectionB: { x: 1, y: 1, w: 100, h: 120 },
      },
    });

    expect(getHomeProjectTopLevelSectionCount(project)).toBe(2);
  });
});
