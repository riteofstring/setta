import { createAppDefinition } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildHydratedAppConfigDefinitionDraftState } from "./useAppConfigDefinitionDrafts";

describe("buildHydratedAppConfigDefinitionDraftState", () => {
  it("hydrates saved app definition drafts and preview overrides", () => {
    const savedSpec = {
      root: {
        key: "app-root",
        type: "Stack",
        props: {},
        children: [],
      },
      elements: {},
    };

    const hydrated = buildHydratedAppConfigDefinitionDraftState({
      savedSpec,
      savedDefinition: createAppDefinition({
        catalogId: "setta.custom.catalog",
        appSpecVersion: "v2",
        appSpecPath: "app_specs/custom.json",
        theme: {
          mode: "dark",
          vars: {
            "--app-accent": "#123456",
          },
        },
        assets: [
          {
            rel: "stylesheet",
            href: "/static/app.css",
          },
        ],
      }),
    });

    expect(hydrated).toEqual({
      draftSpec: JSON.stringify(savedSpec, null, 2),
      catalogId: "setta.custom.catalog",
      specVersion: "v2",
      appSpecPath: "app_specs/custom.json",
      draftTheme: JSON.stringify(
        {
          mode: "dark",
          vars: {
            "--app-accent": "#123456",
          },
        },
        null,
        2,
      ),
      draftAssets: JSON.stringify(
        [
          {
            rel: "stylesheet",
            href: "/static/app.css",
          },
        ],
        null,
        2,
      ),
      themeMode: "dark",
      previewSpecOverride: savedSpec,
      previewThemeOverride: {
        mode: "dark",
        vars: {
          "--app-accent": "#123456",
        },
      },
      previewAssetsOverride: [
        {
          rel: "stylesheet",
          href: "/static/app.css",
        },
      ],
    });
  });

  it("falls back to empty drafts and default metadata when app definition is missing", () => {
    const hydrated = buildHydratedAppConfigDefinitionDraftState({
      savedSpec: null,
      savedDefinition: null,
    });

    expect(hydrated).toEqual({
      draftSpec: "",
      catalogId: "setta.app.default",
      specVersion: "v1",
      appSpecPath: "",
      draftTheme: "",
      draftAssets: "[]",
      themeMode: "auto",
      previewSpecOverride: null,
      previewThemeOverride: null,
      previewAssetsOverride: [],
    });
  });
});
