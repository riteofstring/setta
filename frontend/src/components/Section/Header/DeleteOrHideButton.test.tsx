import { isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { BiHide, BiShow } from "react-icons/bi";
import { beforeEach, describe, expect, it, vi } from "vitest";

let mockCanEditStructure = true;
let mockIsEditingViewMode = false;
let mockVisibility = true;

const deleteSectionsMock = vi.fn((request: unknown) => ({
  kind: "delete",
  request,
}));
const toggleSectionVisibilityMock = vi.fn((request: unknown) => ({
  kind: "toggle",
  request,
}));
const callOpenAPIMock = vi.fn();

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
  deleteSections: (request: unknown) => deleteSectionsMock(request),
  toggleSectionVisibility: (request: unknown) =>
    toggleSectionVisibilityMock(request),
}));

vi.mock("openapi/http/result", () => ({
  callOpenAPI: (request: unknown) => callOpenAPIMock(request),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getActiveViewModeConfig: (state: {
    projectConfig: {
      viewMode: { id: string; visibilityBySectionId: Record<string, boolean> };
    };
  }) => state.projectConfig.viewMode,
  getCurrProjectConfigId: () => "project-config-1",
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: {
      projectConfig: {
        isEditingViewMode: boolean;
        viewMode: {
          id: string;
          visibilityBySectionId: Record<string, boolean>;
        };
      };
    }) => unknown,
  ) =>
    selector({
      projectConfig: {
        isEditingViewMode: mockIsEditingViewMode,
        viewMode: {
          id: "view-mode-1",
          visibilityBySectionId: { "section-1": mockVisibility },
        },
      },
    }),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditStructure: mockCanEditStructure,
  }),
}));

import { DeleteOrHideButton } from "./DeleteOrHideButton";

describe("DeleteOrHideButton", () => {
  beforeEach(() => {
    mockCanEditStructure = true;
    mockIsEditingViewMode = false;
    mockVisibility = true;
    deleteSectionsMock.mockClear();
    toggleSectionVisibilityMock.mockClear();
    callOpenAPIMock.mockClear();
  });

  it("renders delete copy outside view-mode editing", () => {
    const markup = renderToStaticMarkup(
      <DeleteOrHideButton sectionId="section-1" />,
    );

    expect(markup).toContain('aria-label="Delete section"');
    expect(markup).toContain('data-tooltip-content="Delete section"');
    expect(markup).toContain('class="gg-close"');
  });

  it("exposes the hide action while editing a visible section", () => {
    mockIsEditingViewMode = true;
    mockVisibility = true;
    let renderState:
      | {
          isEditingViewMode: boolean;
          visibility: boolean;
          icon: ReactNode;
          label: string;
          onClick: () => void;
        }
      | undefined;

    renderToStaticMarkup(
      <DeleteOrHideButton
        sectionId="section-1"
        render={(state) => {
          renderState = state;
          return null;
        }}
      />,
    );

    expect(renderState).toBeDefined();
    expect(renderState?.isEditingViewMode).toBe(true);
    expect(renderState?.visibility).toBe(true);
    expect(renderState?.label).toBe("Hide section");
    expect(isValidElement(renderState?.icon)).toBe(true);
    expect(
      isValidElement(renderState?.icon) ? renderState.icon.type : null,
    ).toBe(BiShow);

    renderState?.onClick();

    expect(toggleSectionVisibilityMock).toHaveBeenCalledWith({
      body: {
        projectConfigId: "project-config-1",
        sectionIds: ["section-1"],
      },
    });
    expect(callOpenAPIMock).toHaveBeenCalledWith({
      kind: "toggle",
      request: {
        body: {
          projectConfigId: "project-config-1",
          sectionIds: ["section-1"],
        },
      },
    });
    expect(deleteSectionsMock).not.toHaveBeenCalled();
  });

  it("exposes the show action while editing a hidden section", () => {
    mockIsEditingViewMode = true;
    mockVisibility = false;
    let renderState:
      | {
          icon: ReactNode;
          label: string;
        }
      | undefined;

    renderToStaticMarkup(
      <DeleteOrHideButton
        sectionId="section-1"
        render={(state) => {
          renderState = state;
          return null;
        }}
      />,
    );

    expect(renderState?.label).toBe("Show section");
    expect(isValidElement(renderState?.icon)).toBe(true);
    expect(
      isValidElement(renderState?.icon) ? renderState.icon.type : null,
    ).toBe(BiHide);
  });

  it("renders disabled state and skips API calls when structure edits are blocked", () => {
    mockCanEditStructure = false;
    let renderState:
      | {
          onClick: () => void;
        }
      | undefined;

    const markup = renderToStaticMarkup(
      <DeleteOrHideButton
        sectionId="section-1"
        render={(state) => {
          renderState = state;
          return (
            <button type="button" disabled>
              blocked
            </button>
          );
        }}
      />,
    );

    expect(markup).toContain("blocked");

    renderState?.onClick();

    expect(deleteSectionsMock).not.toHaveBeenCalled();
    expect(toggleSectionVisibilityMock).not.toHaveBeenCalled();
    expect(callOpenAPIMock).not.toHaveBeenCalled();
  });
});
