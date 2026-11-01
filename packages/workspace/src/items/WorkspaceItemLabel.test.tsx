import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { WorkspaceItemLabel } from "./WorkspaceItemLabel.js";

describe("WorkspaceItemLabel", () => {
  it("places a leaf label in the package-owned key slot", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceItemLabel
        className="consumer-label"
        isGroup={false}
        title="Leaf label"
      >
        Alpha
      </WorkspaceItemLabel>,
    );

    expect(markup).toBe(
      '<div class="section-key overflow-hidden"><p title="Leaf label" class="consumer-label">Alpha</p></div>',
    );
  });

  it("keeps a group label as a direct row child", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceItemLabel className="consumer-label" isGroup>
        Options
      </WorkspaceItemLabel>,
    );

    expect(markup).toBe('<p class="consumer-label">Options</p>');
  });
});
