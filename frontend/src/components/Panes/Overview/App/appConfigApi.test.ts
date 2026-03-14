import {
  createAppDefinition,
  type ValidateAppDefinitionResponse,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadAppCatalogPromptSummary,
  loadAppConfigDefinition,
  saveAppConfigDefinition,
  validateAppConfigDefinition,
} from "./appConfigApi";

const endpointMocks = vi.hoisted(() => ({
  route_get_app_catalog: vi.fn(),
  route_get_app_definition: vi.fn(),
  route_set_app_definition: vi.fn(),
  route_validate_app_definition: vi.fn(),
}));

vi.mock("utils/generatedEndpoints", () => endpointMocks);

describe("appConfigApi", () => {
  beforeEach(() => {
    endpointMocks.route_get_app_catalog.mockReset();
    endpointMocks.route_get_app_definition.mockReset();
    endpointMocks.route_set_app_definition.mockReset();
    endpointMocks.route_validate_app_definition.mockReset();
  });

  it("loads app config definition payloads from the backend transport", async () => {
    const appDefinition = createAppDefinition({
      catalogId: "setta.catalog",
      appSpecVersion: "v1",
      appSpecPath: "app_specs/app.json",
    });
    endpointMocks.route_get_app_definition.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        appSpec: {
          root: { key: "root", type: "Stack", props: {}, children: [] },
          elements: {},
        },
        appDefinition,
      },
    });

    await expect(loadAppConfigDefinition()).resolves.toEqual({
      ok: true,
      value: {
        appSpec: {
          root: { key: "root", type: "Stack", props: {}, children: [] },
          elements: {},
        },
        appDefinition,
      },
    });
  });

  it("maps save failures to a fallback message when the backend omits detail", async () => {
    endpointMocks.route_set_app_definition.mockResolvedValue({
      status: 500,
      hasResponse: true,
      data: {},
    });

    await expect(
      saveAppConfigDefinition(
        {
          appSpec: {
            root: { key: "root", type: "Stack", props: {}, children: [] },
            elements: {},
          },
          theme: { mode: "auto" },
          assets: [],
        },
        "Failed to save app spec.",
      ),
    ).resolves.toEqual({
      ok: false,
      error: "Failed to save app spec.",
    });
  });

  it("returns validation payloads directly on success", async () => {
    const validationResult: ValidateAppDefinitionResponse = {
      errors: [],
      warnings: [{ message: "Unused element", elementKey: "hero-card" }],
      capabilities: {
        catalogId: "setta.catalog",
        catalogVersion: "2026.03",
        appSpecVersion: "v1",
        themeSchemaVersion: "v1",
        features: {
          actions: true,
        },
      },
    };
    endpointMocks.route_validate_app_definition.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: validationResult,
    });

    await expect(
      validateAppConfigDefinition({
        appSpec: {
          root: { key: "root", type: "Stack", props: {}, children: [] },
          elements: {},
        },
        theme: { mode: "auto" },
        assets: [],
      }),
    ).resolves.toEqual({
      ok: true,
      value: validationResult,
    });
  });

  it("builds catalog prompt summaries from the catalog transport", async () => {
    endpointMocks.route_get_app_catalog.mockResolvedValue({
      status: 200,
      hasResponse: true,
      data: {
        id: "setta.catalog",
        version: "2026.03",
        components: [
          {
            type: "Card",
            props: {
              title: "string",
            },
          },
        ],
        actions: [
          {
            name: "run",
            params: {
              sectionId: "string",
            },
          },
        ],
      },
    });

    await expect(loadAppCatalogPromptSummary()).resolves.toEqual({
      ok: true,
      value: {
        catalogId: "setta.catalog",
        catalogSummary: [
          "Catalog: setta.catalog (version 2026.03)",
          "Components:",
          "- Card (props: title)",
          "Actions:",
          "- run (params: sectionId)",
        ].join("\n"),
      },
    });
  });
});
