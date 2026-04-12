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
  SectionTypeEnum,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LockPositionButton } from "./LockPositionButton";

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

vi.mock("state/actions/sectionInfos", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/sectionInfos")
  >("state/actions/sectionInfos");
  return {
    ...actual,
    dispatchOptimisticProjectStateUpdate: vi.fn(),
  };
});

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
      <Profiler id="lock-position-button-profiler" onRender={onRender}>
        <LockPositionButton sectionId="section-1" />
      </Profiler>,
    );
  });

  return { host, root };
}

describe("LockPositionButton store subscriptions", () => {
  const sectionId = "section-1";
  const variantId = "variant-1";
  const implId = "impl-1";

  beforeEach(() => {
    resetProjectStores();
    useShareSession.setState({ isDeploymentMode: false });
    useProjectState.setState((state) => {
      state.projectConfig = createProjectConfig({
        id: "project-1",
        sectionVariantMap: { [sectionId]: variantId },
        topLevelSections: {
          [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
        },
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
          positionAndSizeLocked: false,
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

  it("stays out of unrelated project-state commits when lock state is unchanged", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledButton(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        // Unrelated preview-variant writes should not fan into every mounted lock button.
        useProjectState.setState((state) => {
          state.previewSectionVariantMap = {
            otherSection: "other-variant",
          };
        });
      });

      expect(onRender).toHaveBeenCalledTimes(initialCommitCount);
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe("Lock position and size");
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("rerenders when this section's lock state changes", async () => {
    const onRender = vi.fn<ProfilerOnRenderCallback>();
    const { host, root } = await renderProfiledButton(onRender);

    try {
      const initialCommitCount = onRender.mock.calls.length;

      await act(async () => {
        useProjectState.setState((state) => {
          const impl = state.sectionImpls[implId];
          if (!impl || impl.type !== SectionTypeEnum.Code) {
            throw new Error(`Missing code impl ${implId}`);
          }
          impl.positionAndSizeLocked = true;
        });
      });

      expect(onRender.mock.calls.length).toBeGreaterThan(initialCommitCount);
      const button = host.querySelector("button");
      expect(button).not.toBeNull();
      expect(button?.getAttribute("aria-label")).toBe(
        "Unlock position and size",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
