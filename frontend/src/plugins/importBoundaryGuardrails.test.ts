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

  it("rejects host tests importing plugin frontend source", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/src/plugins/runtimeBoundaryFixture.test.ts",
        source: `
          import { provider } from "../../../plugins/demo/frontend/src/index";

          export const value = provider;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("runtime metadata");
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

  it("rejects plugin frontend test imports of host source aliases", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "plugins/demo/frontend/tests/pluginBoundaryFixture.test.ts",
        source: `
          import { resetProjectStores } from "state/utils";

          export const value = resetProjectStores;
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

  it("rejects SDK source imports of host source aliases", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/plugin-sdk/app-subsystem/src/sdkBoundaryFixture.ts",
        source: `
          import { endpoint } from "openapi/http";

          export const value = endpoint;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("package-owned code");
  });

  it("rejects SDK source relative imports that escape the SDK package root", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/plugin-sdk/app-subsystem/src/sdkBoundaryFixture.ts",
        source: `
          import sidecar from "../../../../generation/non_http_shared/sidecar.json";

          export const value = sidecar;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("repo-private host paths");
  });

  it("rejects SDK declaration imports of host source aliases", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath: "frontend/plugin-sdk/app-subsystem/types/index.d.ts",
        source: `
          export type SDKValue = import("state/demo").Value;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("package-owned code");
  });

  it("rejects vendored SDK declaration imports of repo-local plugin paths", () => {
    const violations = findImportBoundaryViolations([
      {
        filePath:
          "plugins/demo/frontend/vendor/app-subsystem-frontend-sdk/types/index.d.ts",
        source: `
          export type VendorValue = import("plugins/demo/frontend/src/index").Value;
        `,
      },
    ]);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.message).toContain("published SDK");
  });

  it("rejects frontend/src alias imports across plugin and SDK boundaries", () => {
    const cases = [
      {
        filePath: "plugins/demo/frontend/src/pluginBoundaryFixture.ts",
        expectedMessage: "published SDK",
        source: `
          import { store } from "frontend/src/state/foo";

          export const value = store;
        `,
      },
      {
        filePath: "plugins/demo/frontend/tests/pluginBoundaryFixture.test.ts",
        expectedMessage: "published SDK",
        source: `
          import { renderWithStores } from "frontend/src/testUtils/foo";

          export const value = renderWithStores;
        `,
      },
      {
        filePath: "frontend/plugin-sdk/app-subsystem/src/sdkBoundaryFixture.ts",
        expectedMessage: "package-owned code",
        source: `
          import { client } from "frontend/src/openapi/http";

          export const value = client;
        `,
      },
      {
        filePath: "frontend/plugin-sdk/app-subsystem/types/index.d.ts",
        expectedMessage: "package-owned code",
        source: `
          export type SDKValue = import("frontend/src/plugins/foo").Value;
        `,
      },
      {
        filePath:
          "plugins/demo/frontend/vendor/app-subsystem-frontend-sdk/types/index.d.ts",
        expectedMessage: "published SDK",
        source: `
          export type VendorValue = import("frontend/src/plugins/foo").Value;
        `,
      },
      {
        filePath: "plugins/demo/frontend/src/dynamicBoundaryFixture.ts",
        expectedMessage: "published SDK",
        source: `
          export const value = import("frontend/src/plugins/foo");
        `,
      },
    ];

    for (const testCase of cases) {
      const violations = findImportBoundaryViolations([testCase]);
      expect(violations).toHaveLength(1);
      expect(violations[0]?.message).toContain(testCase.expectedMessage);
    }
  });
});
