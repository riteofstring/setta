/* @vitest-environment jsdom */

import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useProjectState, useShareSession } from "state/definitions";
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
import { DeleteOrHideButton } from "./DeleteOrHideButton";

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

type RenderedProfiledButton = {
  host: HTMLDivElement;
  root: Root;
};

async function renderProfiledButton(
  onRender: ProfilerOnRenderCallback,
): Promise<RenderedProfiledButton> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  await act(async () => {
    root.render(
      <Profiler id="delete-or-hide-button-profiler" onRender={onRender}>
        <DeleteOrHideButton sectionId="section-1" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("DeleteOrHideButton store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
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
          name: "Section",
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
    syncStoreInitialState(useShareSession);
  });

  afterEach(() => {
    resetProjectStores();
    document.body.innerHTML = "";
  });

  it("stays out of unrelated project-state commits when visibility and mode are unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledButton(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant writes should not fan into every mounted hide/delete button.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Hide section");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when the active view visibility for this section changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledButton(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Visibility changes on the subscribed section should still update the button state.
        useProjectState.setState((state) => {
          state.projectConfig.viewModes.all.visibilityBySectionId[sectionId] =
            false;
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Show section");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
