import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Workspace } from "../src/react.js";

describe("Workspace scaffold", () => {
  it("renders a named section with an empty state", () => {
    const markup = renderToStaticMarkup(
      <Workspace ariaLabel="Planning workspace" emptyState="Start with a section." />,
    );

    expect(markup).toContain('aria-label="Planning workspace"');
    expect(markup).toContain("Start with a section.");
  });
});
