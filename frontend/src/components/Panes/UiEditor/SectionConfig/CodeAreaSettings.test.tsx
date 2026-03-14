/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useShareSession } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  CodeFileAccessModeEnum,
  CodeLanguageEnum,
  createProjectConfig,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CodeAreaSettings } from "./CodeAreaSettings";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_set_code_file_binding: vi.fn(async () => ({
      data: null,
      response: new Response("null", { status: 200 }),
      status: 200,
    })),
  };
});

import { route_set_code_file_binding } from "utils/generatedEndpoints";

const mockedRouteSetCodeFileBinding = vi.mocked(route_set_code_file_binding);

type RenderedCodeAreaSettings = {
  host: HTMLDivElement;
  root: Root;
};

async function renderCodeAreaSettings(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(<CodeAreaSettings sectionId={sectionId} />);
  });

  return { host, root } satisfies RenderedCodeAreaSettings;
}

describe("CodeAreaSettings", () => {
  const sectionId = "code-section";
  const variantId = "code-variant";
  const implId = "code-impl";

  const sectionCore: Core = {
    id: sectionId,
    name: "Code Section",
    displayName: "",
    variants: [variantId],
    defaultVariant: variantId,
    sharedModifier: {},
    unsharedKeys: [],
  };

  const sectionVariant: Variant = {
    id: variantId,
    name: "Variant",
    impl: implId,
    nonPresetImpls: [],
    modifier: {},
    isFrozen: false,
  };

  const sectionImpl = {
    type: SectionTypeEnum.Code,
    id: implId,
    name: "Code",
    isFrozen: false,
    isInOtherProjectConfigs: false,
    tagColor: null,
    size: { width: 500, height: 300 },
    aspectRatio: false,
    aspectRatioExtraHeight: 0,
    aspectRatioExtraWidth: 0,
    isMinimized: false,
    positionAndSizeLocked: false,
    isPreset: false,
    code: "print('hi')",
    codeLanguage: CodeLanguageEnum.python,
    codeFileBinding: {
      canonical_path: "pkg/original.py",
      access_mode: CodeFileAccessModeEnum.read_write,
      autoBinding: false,
    },
    attachedTerminalSectionId: null,
    children: [],
    diagnosticsIgnoreState: {
      muted: false,
      suppressedCodes: [],
    },
  };

  beforeEach(() => {
    resetProjectStores();
    mockedRouteSetCodeFileBinding.mockReset();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = { [implId]: { ...sectionImpl } };
      state.previewSectionVariantMap = {};
    });
  });

  afterEach(() => {
    resetProjectStores();
    mockedRouteSetCodeFileBinding.mockReset();
    document.body.innerHTML = "";
  });

  it("posts trimmed file-path updates through the canonical endpoint", async () => {
    const { host, root } = await renderCodeAreaSettings(sectionId);

    try {
      const input = host.querySelector<HTMLInputElement>(
        '[data-testid="code-area-settings-file-path-input"]',
      );
      if (!(input instanceof HTMLInputElement)) {
        throw new Error("Expected file-path input");
      }

      await act(async () => {
        const setValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )?.set;
        if (!setValue) {
          throw new Error("Expected HTMLInputElement value setter");
        }
        setValue.call(input, "  pkg/updated.py  ");
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new FocusEvent("blur", { bubbles: true }));
        input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });

      expect(mockedRouteSetCodeFileBinding).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId,
        binding: {
          canonical_path: "pkg/updated.py",
          access_mode: CodeFileAccessModeEnum.read_write,
        },
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("posts access-mode changes with the current canonical path", async () => {
    const { host, root } = await renderCodeAreaSettings(sectionId);

    try {
      const select = host.querySelector<HTMLSelectElement>(
        '[data-testid="code-area-settings-access-mode-select"]',
      );
      if (!(select instanceof HTMLSelectElement)) {
        throw new Error("Expected access-mode select");
      }

      await act(async () => {
        select.value = CodeFileAccessModeEnum.read_only;
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      expect(mockedRouteSetCodeFileBinding).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        sectionId,
        binding: {
          canonical_path: "pkg/original.py",
          access_mode: CodeFileAccessModeEnum.read_only,
        },
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
