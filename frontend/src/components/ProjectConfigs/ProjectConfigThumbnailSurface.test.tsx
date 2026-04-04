import { renderToStaticMarkup } from "react-dom/server";
import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { ProjectConfigThumbnailSurface } from "./ProjectConfigThumbnailSurface";

describe("ProjectConfigThumbnailSurface", () => {
  it("scales preview content by default", () => {
    const project = createProjectConfig({ id: "project-default-scale" });
    const markup = renderToStaticMarkup(
      <ProjectConfigThumbnailSurface
        previewImgColor="bg-setta-100"
        topLevelSections={project.topLevelSections}
      />,
    );

    expect(markup).toContain("[&amp;&gt;*]:scale-150");
  });

  it("can render preview content without scaling", () => {
    const project = createProjectConfig({ id: "project-no-scale" });
    const markup = renderToStaticMarkup(
      <ProjectConfigThumbnailSurface
        previewImgColor="bg-setta-100"
        topLevelSections={project.topLevelSections}
        scalePreview={false}
      />,
    );

    expect(markup).not.toContain("[&amp;&gt;*]:scale-150");
  });
});
