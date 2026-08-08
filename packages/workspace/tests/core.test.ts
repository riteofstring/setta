import { describe, expect, it } from "vitest";

import { createEmptyWorkspaceDocument, WORKSPACE_DOCUMENT_VERSION } from "../src/core.js";
import { createWorkspaceTestDocument } from "../src/testing.js";

describe("workspace document scaffold", () => {
  it("creates a serializable empty document", () => {
    expect(JSON.parse(JSON.stringify(createEmptyWorkspaceDocument()))).toEqual({
      version: WORKSPACE_DOCUMENT_VERSION,
      rootSectionIds: [],
      sections: {},
    });
  });

  it("creates a deterministic test document", () => {
    const document = createWorkspaceTestDocument([
      { id: "alpha", title: "Alpha" },
      { id: "beta", title: "Beta" },
    ]);

    expect(document.rootSectionIds).toEqual(["alpha", "beta"]);
    expect(document.sections.beta?.title).toBe("Beta");
  });
});
