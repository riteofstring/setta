/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createCodeSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultCodeSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionTitle } from "./SectionTitle";

let mockCanEditStructure = false;

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditStructure: mockCanEditStructure,
  }),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: ({
    content,
    title,
  }: {
    content?: string;
    title?: string;
  }) => ({
    "data-tooltip-content": content ?? title ?? "",
  }),
}));

function syncStoreInitialState(store: {
  getState: () => Record<string, unknown>;
  getInitialState?: () => Record<string, unknown>;
}) {
  if (!store.getInitialState) {
    return;
  }
  const initial = store.getInitialState();
  Object.assign(initial, store.getState());
}

type RenderedProfiledTitle = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledTitle(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledTitle> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="section-title-profiler" onRender={onRender}>
        <SectionTitle
          sectionId="section-1"
          titleProps={{ fixed: "section-title-fixed" }}
        />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("SectionTitle store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    mockCanEditStructure = false;
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        isEditingViewMode: true,
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
        viewModes: {
          all: {
            id: "all",
            name: "All",
            visibilityBySectionId: { [sectionId]: true },
            availableToUsers: true,
          },
        },
        activeViewModeId: "all",
      });
      state.sections = {
        [sectionId]: createCore({
          id: sectionId,
          name: "Original Title",
          variants: [variantId],
          defaultVariant: variantId,
        }),
      };
      state.sectionVariants = {
        [variantId]: createVariant({
          id: variantId,
          name: "Variant",
          impl: implId,
          nonPresetImpls: [],
        }),
      };
      state.sectionImpls = {
        [implId]: createCodeSectionImpl(createUserDefaultCodeSectionImpl(), {
          id: implId,
        }),
      };
      state.previewSectionVariantMap = {};
    });
    syncStoreInitialState(useProjectState);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated project-state commits when title inputs are unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledTitle(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant writes should not fan into every mounted section title.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      expect(host.textContent).toContain("Original Title");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the subscribed section name changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledTitle(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Actual title changes on the subscribed section should still update the rendered heading.
        useProjectState.setState((state) => {
          state.sections[sectionId].name = "Renamed Title";
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      expect(host.textContent).toContain("Renamed Title");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
