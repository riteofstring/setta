import { createProjectConfig } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveDefaultProjectConfigName,
  shouldLoadDefaultProjectMetadata,
} from "./defaultProjectRouting";

describe("defaultProjectRouting", () => {
  it("resolves the default project name from Go-owned project metadata", () => {
    const alpha = createProjectConfig({ id: "project-alpha", name: "Alpha" });
    const beta = createProjectConfig({ id: "project-beta", name: "Beta" });

    // The redirect target should be derived from the metadata payload keyed by
    // the configured default project id.
    expect(resolveDefaultProjectConfigName("project-beta", [alpha, beta])).toBe(
      "Beta",
    );
  });

  it("returns null when the default project id is absent from metadata", () => {
    const alpha = createProjectConfig({ id: "project-alpha", name: "Alpha" });

    // Missing or stale ids should fall back to the home route instead of
    // inventing a project target.
    expect(resolveDefaultProjectConfigName("project-beta", [alpha])).toBeNull();
    expect(resolveDefaultProjectConfigName(null, [alpha])).toBeNull();
  });

  it("loads default-project metadata only while the redirect is still unresolved", () => {
    // Once the redirect has enough information or already attempted a load, it
    // should stop issuing metadata requests.
    expect(
      shouldLoadDefaultProjectMetadata({
        enabled: true,
        hasAttemptedMetadataLoad: false,
        projectMetadataCount: 0,
      }),
    ).toBe(true);
    expect(
      shouldLoadDefaultProjectMetadata({
        enabled: false,
        hasAttemptedMetadataLoad: false,
        projectMetadataCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldLoadDefaultProjectMetadata({
        enabled: true,
        hasAttemptedMetadataLoad: true,
        projectMetadataCount: 0,
      }),
    ).toBe(false);
    expect(
      shouldLoadDefaultProjectMetadata({
        enabled: true,
        hasAttemptedMetadataLoad: false,
        projectMetadataCount: 1,
      }),
    ).toBe(false);
  });
});
