/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  SectionTypeEnum,
  type Core,
  type Variant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachedTerminalControls } from "./AttachedTerminalControls";

vi.mock("utils/generatedEndpoints", async () => {
  const actual = await import("utils/generatedEndpoints");
  return {
    ...actual,
    route_create_child_sections: vi.fn(async () => ({
      data: { sectionIds: ["terminal-section"] },
      response: new Response(`{"sectionIds":["terminal-section"]}`, {
        status: 200,
      }),
      status: 200,
    })),
  };
});

import { route_create_child_sections } from "utils/generatedEndpoints";

const mockedRouteCreateChildSections = vi.mocked(route_create_child_sections);

type RenderedAttachedTerminalControls = {
  host: HTMLDivElement;
  root: Root;
};

async function renderAttachedTerminalControls(sectionId: string) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <AttachedTerminalControls isUserView={false} sectionId={sectionId} />,
    );
  });

  return { host, root } satisfies RenderedAttachedTerminalControls;
}

describe("AttachedTerminalControls", () => {
  const sectionId = "code-section";
  const variantId = "code-variant";
  const implId = "code-impl";

  const sectionCore: Core = {
    id: sectionId,
    name: "Code",
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

  beforeEach(() => {
    resetProjectStores();
    mockedRouteCreateChildSections.mockClear();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
      });
      state.sections = { [sectionId]: sectionCore };
      state.sectionVariants = { [variantId]: sectionVariant };
      state.sectionImpls = {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
          attachedTerminalSectionId: null,
          children: [],
        }),
      };
      state.parentSectionMap = { [sectionId]: null };
      state.previewSectionVariantMap = {};
    });
  });

  afterEach(() => {
    resetProjectStores();
    mockedRouteCreateChildSections.mockClear();
    document.body.innerHTML = "";
  });

  it("posts terminal child creation through the canonical endpoint", async () => {
    const { host, root } = await renderAttachedTerminalControls(sectionId);

    try {
      const button = host.querySelector<HTMLButtonElement>(
        "[data-attached-terminal-toggle]",
      );
      if (!(button instanceof HTMLButtonElement)) {
        throw new Error("Expected attached-terminal toggle button");
      }

      await act(async () => {
        button.click();
      });

      expect(mockedRouteCreateChildSections).toHaveBeenCalledWith({
        projectConfigId: "project-1",
        parentId: sectionId,
        implType: SectionTypeEnum.Terminal,
        numChildren: 1,
        startIdx: 0,
      });
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
