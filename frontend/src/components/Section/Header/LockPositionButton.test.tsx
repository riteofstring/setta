import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionTypeEnum } from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockCanEditLayout = true;
let mockProjectState = {
  sections: {
    "section-1": {
      positionAndSizeLocked: false,
      type: SectionTypeEnum.Chat,
    },
  },
};

const togglePositionLocksMock = vi.fn((request: unknown) => ({
  kind: "togglePositionLocks",
  request,
}));
const callOpenAPIMock = vi.fn((request: unknown) => request);
const dispatchOptimisticProjectStateUpdateMock = vi.fn();

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

vi.mock("openapi/http", () => ({
  togglePositionLocks: (request: unknown) => togglePositionLocksMock(request),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: (request: unknown) => callOpenAPIMock(request),
}));

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate: (request: unknown) =>
    dispatchOptimisticProjectStateUpdateMock(request),
  getCurrEffectiveSectionImpl: (
    state: typeof mockProjectState,
    sectionId: keyof typeof mockProjectState.sections,
  ) => state.sections[sectionId],
  getCurrProjectConfigId: () => "project-config-1",
  setCurrEffectiveSectionImplValue: (
    state: typeof mockProjectState,
    sectionId: keyof typeof mockProjectState.sections,
    next: Partial<(typeof mockProjectState.sections)["section-1"]>,
  ) => {
    state.sections[sectionId] = {
      ...state.sections[sectionId],
      ...next,
    };
  },
}));

vi.mock("state/definitions", () => ({
  useProjectState: (selector: (state: typeof mockProjectState) => unknown) =>
    selector(mockProjectState),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditLayout: mockCanEditLayout,
  }),
}));

import { LockPositionButton } from "./LockPositionButton";

type RenderState = Parameters<
  NonNullable<ComponentProps<typeof LockPositionButton>["render"]>
>[0];

describe("LockPositionButton", () => {
  beforeEach(() => {
    mockCanEditLayout = true;
    mockProjectState = {
      sections: {
        "section-1": {
          positionAndSizeLocked: false,
          type: SectionTypeEnum.Chat,
        },
      },
    };
    togglePositionLocksMock.mockClear();
    callOpenAPIMock.mockClear();
    dispatchOptimisticProjectStateUpdateMock.mockClear();
  });

  it("renders the unlocked button state for non-group sections", () => {
    const markup = renderToStaticMarkup(
      <LockPositionButton sectionId="section-1" />,
    );

    expect(markup).toContain('aria-label="Lock position and size"');
    expect(markup).toContain('title="Lock position and size"');
    expect(markup).toContain('data-tooltip-content="Lock position and size"');
    expect(markup).toContain("gg-lock-unlock");
    expect(markup).toContain("text-setta-600");
    expect(markup).toContain("h-4 w-4");
  });

  it("renders the locked themed state for group sections", () => {
    mockProjectState.sections["section-1"] = {
      positionAndSizeLocked: true,
      type: SectionTypeEnum.Group,
    };

    const markup = renderToStaticMarkup(
      <LockPositionButton sectionId="section-1" hasSectionStyleTheme />,
    );

    expect(markup).toContain('aria-label="Unlock position and size"');
    expect(markup).toContain("gg-lock");
    expect(markup).toContain("bg-[color:var(--setta-section-style-bg)]");
    expect(markup).toContain(
      "focus-visible:ring-[var(--setta-section-style-outline)]",
    );
    expect(markup).toContain("text-[color:var(--setta-section-style-outline)]");
    expect(markup).toContain("h-5 w-5");
  });

  it("dispatches the optimistic lock toggle when clicked", () => {
    let renderState: RenderState | undefined;

    renderToStaticMarkup(
      <LockPositionButton
        sectionId="section-1"
        render={(state) => {
          renderState = state;
          return null;
        }}
      />,
    );

    renderState?.onClick();

    expect(dispatchOptimisticProjectStateUpdateMock).toHaveBeenCalledTimes(1);
    expect(renderState).toMatchObject({
      iconClassName: "gg-lock-unlock",
      isGroup: false,
      label: "Lock position and size",
      positionAndSizeLocked: false,
    });

    const optimisticUpdate =
      dispatchOptimisticProjectStateUpdateMock.mock.calls[0]?.[0];
    expect(optimisticUpdate).toBeDefined();

    optimisticUpdate.apply(mockProjectState);
    expect(mockProjectState.sections["section-1"].positionAndSizeLocked).toBe(
      true,
    );

    const sent = optimisticUpdate.send("frontend-op-1");
    expect(togglePositionLocksMock).toHaveBeenCalledWith({
      body: {
        frontendOpId: "frontend-op-1",
        projectConfigId: "project-config-1",
        sectionIds: ["section-1"],
      },
    });
    expect(callOpenAPIMock).toHaveBeenCalledWith({
      kind: "togglePositionLocks",
      request: {
        body: {
          frontendOpId: "frontend-op-1",
          projectConfigId: "project-config-1",
          sectionIds: ["section-1"],
        },
      },
    });
    expect(sent).toEqual({
      kind: "togglePositionLocks",
      request: {
        body: {
          frontendOpId: "frontend-op-1",
          projectConfigId: "project-config-1",
          sectionIds: ["section-1"],
        },
      },
    });
  });

  it("renders disabled state and ignores clicks when layout edits are blocked", () => {
    mockCanEditLayout = false;
    let renderState: RenderState | undefined;

    const markup = renderToStaticMarkup(
      <LockPositionButton
        sectionId="section-1"
        render={(state) => {
          renderState = state;
          return <button type="button">blocked</button>;
        }}
      />,
    );

    expect(markup).toContain("blocked");

    renderState?.onClick();

    expect(dispatchOptimisticProjectStateUpdateMock).not.toHaveBeenCalled();

    const disabledMarkup = renderToStaticMarkup(
      <LockPositionButton sectionId="section-1" />,
    );

    expect(disabledMarkup).toContain("cursor-not-allowed opacity-50");
    expect(disabledMarkup).toContain("disabled");
  });
});
