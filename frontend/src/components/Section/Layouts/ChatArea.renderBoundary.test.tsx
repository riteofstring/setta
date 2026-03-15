/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { setCurrEffectiveSectionImplValue } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  createChatSectionImpl,
  createCore,
  createProjectConfig,
  createUserDefaultChatSectionImpl,
  createVariant,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let managedSurfaceRenderCount = 0;
let scriptableSurfaceRenderCount = 0;

vi.mock("./chatAreaManagedSurface", () => ({
  ManagedChatAreaSurface: ({ sectionId }: { sectionId: string }) => {
    managedSurfaceRenderCount += 1;
    return (
      <div data-testid="managed-chat-area-surface">managed:{sectionId}</div>
    );
  },
}));

vi.mock("./chatAreaScriptableSurface", () => ({
  ScriptableChatAreaSurface: ({ sectionId }: { sectionId: string }) => {
    scriptableSurfaceRenderCount += 1;
    return (
      <div data-testid="scriptable-chat-area-surface">
        scriptable:{sectionId}
      </div>
    );
  },
}));

import { ChatArea } from "./ChatArea";

const sectionId = "chat-area-section";
const variantId = "chat-area-variant";
const implId = "chat-area-impl";

function seedChatArea(managed: boolean) {
  useProjectState.setState({
    projectConfig: createProjectConfig({
      id: "project-1",
      sectionVariantMap: { [sectionId]: variantId },
      topLevelSections: {
        [sectionId]: { x: 0, y: 0, zIndex: 0, w: null, h: null },
      },
      agenticEdges: [],
    }),
    sections: {
      [sectionId]: createCore({
        id: sectionId,
        name: "Chat Area",
        variants: [variantId],
        defaultVariant: variantId,
      }),
    },
    sectionVariants: {
      [variantId]: createVariant({
        id: variantId,
        name: "Chat Area Variant",
        impl: implId,
        nonPresetImpls: [],
      }),
    },
    sectionImpls: {
      [implId]: createChatSectionImpl(
        createUserDefaultChatSectionImpl({
          managed,
          inputText: "draft",
          thinking: false,
        }),
        { id: implId },
      ),
    },
    parentSectionMap: { [sectionId]: null },
    previewSectionVariantMap: {},
  });
}

function updateChatSection(
  patch: Partial<
    Parameters<typeof setCurrEffectiveSectionImplValue<"ChatSection">>[2]
  >,
) {
  act(() => {
    useProjectState.setState((state) => {
      setCurrEffectiveSectionImplValue<"ChatSection">(state, sectionId, patch);
    });
  });
}

describe("ChatArea render boundary", () => {
  let host: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    resetProjectStores();
    managedSurfaceRenderCount = 0;
    scriptableSurfaceRenderCount = 0;
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    resetProjectStores();
  });

  it("keeps the scriptable root surface stable when scriptable-only fields change", () => {
    seedChatArea(false);

    act(() => {
      root.render(<ChatArea sectionId={sectionId} />);
    });

    expect(
      host.querySelector('[data-testid="scriptable-chat-area-surface"]')
        ?.textContent,
    ).toContain(sectionId);
    expect(scriptableSurfaceRenderCount).toBe(1);
    expect(managedSurfaceRenderCount).toBe(0);

    updateChatSection({ inputText: "updated draft" });

    expect(scriptableSurfaceRenderCount).toBe(1);
    expect(managedSurfaceRenderCount).toBe(0);
  });

  it("keeps the managed root surface stable when managed-only fields change", () => {
    seedChatArea(true);

    act(() => {
      root.render(<ChatArea sectionId={sectionId} />);
    });

    expect(
      host.querySelector('[data-testid="managed-chat-area-surface"]')
        ?.textContent,
    ).toContain(sectionId);
    expect(managedSurfaceRenderCount).toBe(1);
    expect(scriptableSurfaceRenderCount).toBe(0);

    updateChatSection({ thinking: true });

    expect(managedSurfaceRenderCount).toBe(1);
    expect(scriptableSurfaceRenderCount).toBe(0);
  });

  it("switches local surfaces when the managed mode flips", () => {
    seedChatArea(true);

    act(() => {
      root.render(<ChatArea sectionId={sectionId} />);
    });

    expect(
      host.querySelector('[data-testid="managed-chat-area-surface"]'),
    ).toBeTruthy();
    expect(managedSurfaceRenderCount).toBe(1);

    updateChatSection({ managed: false });

    expect(
      host.querySelector('[data-testid="scriptable-chat-area-surface"]'),
    ).toBeTruthy();
    expect(managedSurfaceRenderCount).toBe(1);
    expect(scriptableSurfaceRenderCount).toBe(1);
  });
});
