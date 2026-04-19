import { describe, expect, it } from "vitest";
import { findImportBoundaryViolations } from "../../scripts/check_import_boundaries.mjs";

describe("import boundary guardrails", () => {
  it("rejects host runtime imports of plugin frontend source", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/src/plugins/runtimeBoundaryFixture.ts",
        source: `
          import { provider } from "../../../plugins/demo/frontend/src/index";

          export const value = provider;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("runtime metadata");
  });

  it("allows host tests to import plugin frontend source", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/src/plugins/runtimeBoundaryFixture.test.ts",
        source: `
          import { provider } from "../../../plugins/demo/frontend/src/index";

          export const value = provider;
        `,
      },
    ]);

    expect(violations).toHaveLength(0);
  });

  it("rejects plugin frontend imports of host source aliases", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "plugins/demo/frontend/src/pluginBoundaryFixture.ts",
        source: `
          import { endpoint } from "openapi/http";

          export const value = endpoint;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("published SDK");
  });

  it("rejects plugin frontend relative imports that escape the plugin root", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "plugins/demo/frontend/src/pluginBoundaryFixture.ts",
        source: `
          import sidecar from "../../../../frontend/generation/non_http_shared/sidecar.json";

          export const value = sidecar;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("repo-private host paths");
  });
});
