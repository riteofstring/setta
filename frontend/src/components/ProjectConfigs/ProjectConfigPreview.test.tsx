import { renderToStaticMarkup } from "react-dom/server";
import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { ProjectConfigPreview } from "./ProjectConfigPreview";

describe("ProjectConfigPreview", () => {
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
});
