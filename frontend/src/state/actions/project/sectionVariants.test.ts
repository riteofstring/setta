import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteJSONSourceFileAndVariant,
  deleteSectionVariantOrAsk,
} from "./sectionVariants";

vi.mock("utils/generatedEndpoints", () => ({
  route_delete_json_source_file_and_variant: vi.fn(),
  route_delete_section_variant_or_ask: vi.fn(),
}));

describe("section variant delete actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the filepath when deleteSectionVariantOrAsk needs confirmation", async () => {
    const { route_delete_section_variant_or_ask } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 200,
      data: "/tmp/workspace/data/source.json",
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAsk({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
    });

    expect(filepath).toBe("/tmp/workspace/data/source.json");
  });

  it("returns null when deleteSectionVariantOrAsk deletes directly", async () => {
    const { route_delete_section_variant_or_ask } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAsk({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
  });

  it("returns null when deleteSectionVariantOrAsk fails", async () => {
    const { route_delete_section_variant_or_ask } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_delete_section_variant_or_ask).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAsk({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
  });

  it("returns success when deleteJSONSourceFileAndVariant succeeds", async () => {
    const { route_delete_json_source_file_and_variant } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_delete_json_source_file_and_variant).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariant({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(true);
    expect(route_delete_json_source_file_and_variant).toHaveBeenCalledWith({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });
  });

  it("returns failure when deleteJSONSourceFileAndVariant fails", async () => {
    const { route_delete_json_source_file_and_variant } = await import(
      "utils/generatedEndpoints"
    );
    vi.mocked(route_delete_json_source_file_and_variant).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariant({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(false);
  });
});
