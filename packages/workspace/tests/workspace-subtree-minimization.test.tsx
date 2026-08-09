import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { WorkspaceDocument, WorkspaceSection } from "../src/core.js";
import { Workspace } from "../src/react.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

function minimizedSubtreeDocument(): WorkspaceDocument {
  const base = createWorkspaceTestDocument([
    { id: "root", title: "Root container" },
    { id: "child", title: "First child" },
  ]);
  const root = base.sections.root as WorkspaceSection;
  return {
    ...base,
    rootSections: [{ position: { x: 40, y: 60 }, sectionId: "root" }],
    sections: {
      ...base.sections,
      root: {
        ...root,
        childLayout: {
          orientation: "vertical",
          overflow: "grow",
          positioning: "ordered",
          sectionIds: ["child"],
        },
        isMinimized: true,
      },
    },
  };
}

describe("Workspace subtree minimization scaffold", () => {
  it("unmounts the complete descendant tree for an opted-in minimized container", () => {
    const markup = renderToStaticMarkup(
      <Workspace
        defaultDocument={minimizedSubtreeDocument()}
        sectionDefinitions={[
          {
            canContainSections: true,
            defaultSize: { height: 180, width: 240 },
            displayName: "Recursive fixture",
            kind: "test",
            minimizeScope: "subtree",
            render: ({ sectionId }) => <span>Host body for {sectionId}</span>,
          },
        ]}
      />,
    );

    expect(markup.match(/<article/gu)).toHaveLength(1);
    expect(markup).toContain('data-workspace-minimize-scope="subtree"');
    expect(markup).toContain('data-workspace-descendants-collapsed="true"');
    expect(markup).toContain("Minimized subtree");
    expect(markup).toMatch(
      /aria-controls="([^"]+)-content \1-descendants"[^>]+aria-expanded="false"[^>]+aria-label="Expand Root container and descendant sections"/u,
    );
    expect(markup).toMatch(
      /data-workspace-section-descendants="root" hidden="" id="[^"]+-descendants"/u,
    );
    expect(markup).not.toContain('data-workspace-section-id="child"');
    expect(markup).not.toContain("Host body for child");
  });
});
