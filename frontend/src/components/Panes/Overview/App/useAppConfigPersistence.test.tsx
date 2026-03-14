/* @vitest-environment jsdom */

import type { Spec } from "@json-render/core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  createAppDefinition,
  type ValidateAppDefinitionResponse,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAppConfigPersistence,
  type UseAppConfigPersistenceArgs,
} from "./useAppConfigPersistence";

const dependencyMocks = vi.hoisted(() => ({
  addTemporaryNotification: vi.fn(),
  loadAppConfigDefinition: vi.fn(),
  saveAppConfigDefinition: vi.fn(),
  validateAppConfigDefinition: vi.fn(),
  resetAppConfigPreviewOverrides: vi.fn(),
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: dependencyMocks.addTemporaryNotification,
}));

vi.mock("./appConfigApi", () => ({
  loadAppConfigDefinition: dependencyMocks.loadAppConfigDefinition,
  saveAppConfigDefinition: dependencyMocks.saveAppConfigDefinition,
  validateAppConfigDefinition: dependencyMocks.validateAppConfigDefinition,
}));

vi.mock("./useAppConfigDefinitionDrafts", async () => {
  const actual = await vi.importActual<
    typeof import("./useAppConfigDefinitionDrafts")
  >("./useAppConfigDefinitionDrafts");
  return {
    ...actual,
    resetAppConfigPreviewOverrides:
      dependencyMocks.resetAppConfigPreviewOverrides,
  };
});

let latestHook: ReturnType<typeof useAppConfigPersistence> | null = null;

function AppConfigPersistenceProbe(props: UseAppConfigPersistenceArgs) {
  latestHook = useAppConfigPersistence(props);
  return null;
}

function buildValidSpec() {
  return {
    root: {
      key: "app-root",
      type: "Stack",
      props: {},
      children: [],
    },
    elements: {},
  };
}

describe("useAppConfigPersistence", () => {
  let host: HTMLDivElement;
  let root: Root;
  let clearDraftErrors: ReturnType<typeof vi.fn>;
  let hydrateSavedAppDefinition: ReturnType<typeof vi.fn>;

  function buildProps(
    overrides: Partial<UseAppConfigPersistenceArgs> = {},
  ): UseAppConfigPersistenceArgs {
    return {
      projectConfigId: "",
      appSpecPath: "app_specs/app.json",
      catalogId: "setta.app.default",
      clearDraftErrors,
      draftAssets: "[]",
      draftSpec: JSON.stringify(buildValidSpec(), null, 2),
      draftTheme: JSON.stringify({ mode: "auto" }, null, 2),
      hydrateSavedAppDefinition,
      specVersion: "v1",
      themeMode: "auto",
      ...overrides,
    };
  }

  async function renderProbe(
    overrides: Partial<UseAppConfigPersistenceArgs> = {},
  ) {
    await act(async () => {
      root.render(<AppConfigPersistenceProbe {...buildProps(overrides)} />);
    });
  }

  beforeEach(() => {
    latestHook = null;
    clearDraftErrors = vi.fn();
    hydrateSavedAppDefinition = vi.fn();
    dependencyMocks.addTemporaryNotification.mockReset();
    dependencyMocks.loadAppConfigDefinition.mockReset();
    dependencyMocks.saveAppConfigDefinition.mockReset();
    dependencyMocks.validateAppConfigDefinition.mockReset();
    dependencyMocks.resetAppConfigPreviewOverrides.mockReset();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("loads and hydrates the saved app definition when a project config is active", async () => {
    const savedSpec = buildValidSpec();
    const savedDefinition = createAppDefinition({
      catalogId: "setta.catalog",
      appSpecVersion: "v2",
      appSpecPath: "app_specs/generated.json",
    });
    dependencyMocks.loadAppConfigDefinition.mockResolvedValue({
      ok: true,
      value: {
        appSpec: savedSpec,
        appDefinition: savedDefinition,
      },
    });

    await renderProbe({ projectConfigId: "project-config-1" });

    await vi.waitFor(() => {
      expect(dependencyMocks.loadAppConfigDefinition).toHaveBeenCalledTimes(1);
      expect(
        dependencyMocks.resetAppConfigPreviewOverrides,
      ).toHaveBeenCalledTimes(1);
      expect(clearDraftErrors).toHaveBeenCalledTimes(1);
      expect(hydrateSavedAppDefinition).toHaveBeenCalledWith({
        savedSpec,
        savedDefinition,
      });
      expect(latestHook?.loading).toBe(false);
      expect(latestHook?.errorMessage).toBeNull();
    });
  });

  it("saves draft app definitions through the transport owner", async () => {
    const savedSpec = buildValidSpec();
    const savedDefinition = createAppDefinition({
      catalogId: "setta.catalog",
      appSpecVersion: "v1",
      appSpecPath: "app_specs/app.json",
    });
    dependencyMocks.saveAppConfigDefinition.mockResolvedValue({
      ok: true,
      value: {
        appSpec: savedSpec,
        appDefinition: savedDefinition,
      },
    });

    await renderProbe();
    if (!latestHook) {
      throw new Error("Expected hook state.");
    }

    await act(async () => {
      await latestHook?.handleSave();
    });

    expect(dependencyMocks.saveAppConfigDefinition).toHaveBeenCalledWith(
      {
        appSpec: buildValidSpec(),
        appSpecPath: "app_specs/app.json",
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
        theme: { mode: "auto" },
        assets: [],
      },
      "Failed to save app spec.",
    );
    expect(hydrateSavedAppDefinition).toHaveBeenCalledWith({
      savedSpec,
      savedDefinition,
    });
    expect(dependencyMocks.addTemporaryNotification).toHaveBeenCalledWith(
      "App spec saved.",
    );
  });

  it("publishes validation results and warning notifications", async () => {
    const validationResult: ValidateAppDefinitionResponse = {
      errors: [],
      warnings: [{ message: "Unused card", elementKey: "card-1" }],
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
    dependencyMocks.validateAppConfigDefinition.mockResolvedValue({
      ok: true,
      value: validationResult,
    });

    await renderProbe();
    if (!latestHook) {
      throw new Error("Expected hook state.");
    }

    await act(async () => {
      await latestHook?.handleValidate();
    });

    expect(dependencyMocks.validateAppConfigDefinition).toHaveBeenCalledWith({
      appSpec: buildValidSpec(),
      appSpecVersion: "v1",
      catalogId: "setta.app.default",
      theme: { mode: "auto" },
      assets: [],
    });
    expect(latestHook?.validationResult).toEqual(validationResult);
    expect(dependencyMocks.addTemporaryNotification).toHaveBeenCalledWith(
      "Validation passed with 1 warning(s).",
    );
  });

  it("persists generated specs without entering the loading state", async () => {
    dependencyMocks.saveAppConfigDefinition.mockResolvedValue({
      ok: true,
      value: {
        appSpec: buildValidSpec(),
        appDefinition: createAppDefinition({
          catalogId: "setta.catalog",
          appSpecVersion: "v1",
          appSpecPath: "app_specs/app.json",
        }),
      },
    });

    await renderProbe();
    if (!latestHook) {
      throw new Error("Expected hook state.");
    }

    let persisted = false;
    await act(async () => {
      persisted = await latestHook?.persistGeneratedSpec(
        buildValidSpec() as unknown as Spec,
      );
    });

    expect(persisted).toBe(true);
    expect(latestHook?.loading).toBe(false);
    expect(dependencyMocks.saveAppConfigDefinition).toHaveBeenCalledWith(
      {
        appSpec: buildValidSpec(),
        appSpecPath: "app_specs/app.json",
        appSpecVersion: "v1",
        catalogId: "setta.app.default",
        theme: { mode: "auto" },
        assets: [],
      },
      "Failed to save generated app spec.",
    );
  });
});
