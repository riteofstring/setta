import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteJSONSourceFileAndVariant as deleteJSONSourceFileAndVariantAction,
  deleteSectionVariantOrAsk as deleteSectionVariantOrAskAction,
} from "./sectionVariants";

const callOpenAPIMock = vi.fn((promise: Promise<unknown>) => promise);

vi.mock("openapi/http", () => ({
  deleteJsonSourceFileAndVariant: vi.fn(),
  deleteSectionVariantOrAsk: vi.fn(),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: (promise: Promise<unknown>) => callOpenAPIMock(promise),
}));

describe("section variant delete actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callOpenAPIMock.mockClear();
  });

  it("returns the filepath when deleteSectionVariantOrAsk needs confirmation", async () => {
    const { deleteSectionVariantOrAsk: deleteSectionVariantOrAskRequest } =
      await import("openapi/http");
    vi.mocked(deleteSectionVariantOrAskRequest).mockResolvedValue({
      status: 200,
      data: "/tmp/workspace/data/source.json",
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAction({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
    });

    expect(filepath).toBe("/tmp/workspace/data/source.json");
    expect(deleteSectionVariantOrAskRequest).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        sectionId: "json-section",
        variantId: "json-variant-a",
      },
    });
  });

  it("returns null when deleteSectionVariantOrAsk deletes directly", async () => {
    const { deleteSectionVariantOrAsk: deleteSectionVariantOrAskRequest } =
      await import("openapi/http");
    vi.mocked(deleteSectionVariantOrAskRequest).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAction({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
  });

  it("returns null when deleteSectionVariantOrAsk fails", async () => {
    const { deleteSectionVariantOrAsk: deleteSectionVariantOrAskRequest } =
      await import("openapi/http");
    vi.mocked(deleteSectionVariantOrAskRequest).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const filepath = await deleteSectionVariantOrAskAction({
      projectConfigId: "project-alpha",
      sectionId: "plain-section",
      variantId: "plain-variant-b",
    });

    expect(filepath).toBeNull();
  });

  it("returns success when deleteJSONSourceFileAndVariant succeeds", async () => {
    const {
      deleteJsonSourceFileAndVariant: deleteJsonSourceFileAndVariantRequest,
    } = await import("openapi/http");
    vi.mocked(deleteJsonSourceFileAndVariantRequest).mockResolvedValue({
      status: 200,
      data: null,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariantAction({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(true);
    expect(deleteJsonSourceFileAndVariantRequest).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-alpha",
        sectionId: "json-section",
        variantId: "json-variant-a",
        filepath: "/tmp/workspace/data/source.json",
      },
    });
  });

  it("returns failure when deleteJSONSourceFileAndVariant fails", async () => {
    const {
      deleteJsonSourceFileAndVariant: deleteJsonSourceFileAndVariantRequest,
    } = await import("openapi/http");
    vi.mocked(deleteJsonSourceFileAndVariantRequest).mockResolvedValue({
      status: 500,
      data: null,
      hasResponse: true,
    });

    const updated = await deleteJSONSourceFileAndVariantAction({
      projectConfigId: "project-alpha",
      sectionId: "json-section",
      variantId: "json-variant-a",
      filepath: "/tmp/workspace/data/source.json",
    });

    expect(updated).toBe(false);
  });
});
