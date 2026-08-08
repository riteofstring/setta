import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ViewingEditingMode } from "./ViewingEditingMode";

type MockProjectState = {
  projectConfig: {
    id: string;
    activeViewModeId: string;
    isEditingViewMode: boolean;
    viewModes: Record<string, { id: string; name: string; sortIndex: number }>;
  };
};

let mockProjectState: MockProjectState = {
  projectConfig: {
    id: "project-1",
    activeViewModeId: "view-mode-1",
    isEditingViewMode: true,
    viewModes: {
      "view-mode-1": {
        id: "view-mode-1",
        name: "Default",
        sortIndex: 0,
      },
    },
  },
};

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  ViewModeSortableProvider: ({ children }: { children: ReactNode }) => children,
  useViewModeSortableItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));

vi.mock("re-resizable", () => ({
  Resizable: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditParams: false,
    canEditVariants: true,
    canEditLayout: true,
    canRun: false,
    canEditStructure: false,
  }),
}));

vi.mock("state/actions/activeSections", () => ({
  pruneActiveSectionIdsForViewMode: () => undefined,
}));

vi.mock("state/actions/project/loadProject", () => ({
  useCreateAndGoToProjectConfig: () => () => undefined,
}));

vi.mock("state/actions/sectionInfos", () => ({
  dispatchOptimisticProjectStateUpdate: () => undefined,
}));

vi.mock("state/actions/viewModes", () => ({
  persistViewModeSortOrder: () => undefined,
}));

vi.mock("utils/generatedEndpoints", () => ({
  route_create_view_mode: () => Promise.resolve(),
  route_delete_view_mode: () => Promise.resolve(),
  route_set_active_view_mode: () => Promise.resolve(),
  route_set_view_mode_name: () => Promise.resolve(),
  route_toggle_is_editing_view_mode: () => Promise.resolve(),
  route_toggle_view_mode_tab: () => Promise.resolve(),
  route_toggle_view_mode_user_facing: () => Promise.resolve(),
}));

vi.mock("./ProjectConfigs", () => ({
  ProjectConfigs: () => <div data-testid="mock-project-configs" />,
}));

vi.mock("./WindowSpacesPane", () => ({
  WindowSpacesPane: ({
    canEditLayout,
    isEditing,
  }: {
    canEditLayout: boolean;
    isEditing: boolean;
  }) => (
    <div
      data-testid="mock-window-spaces-pane"
      data-window-spaces-can-edit-layout={canEditLayout ? "true" : "false"}
      data-window-spaces-is-editing={isEditing ? "true" : "false"}
    />
  ),
}));

describe("ViewingEditingMode window-space permissions", () => {
  beforeEach(() => {
    mockProjectState = {
      projectConfig: {
        id: "project-1",
        activeViewModeId: "view-mode-1",
        isEditingViewMode: true,
        viewModes: {
          "view-mode-1": {
            id: "view-mode-1",
            name: "Default",
            sortIndex: 0,
          },
        },
      },
    };
  });

  it("passes layout permissions through to the window-space pane", () => {
    const markup = renderToStaticMarkup(<ViewingEditingMode />);

    expect(markup).toContain('data-testid="mock-window-spaces-pane"');
    expect(markup).toContain('data-window-spaces-can-edit-layout="true"');
    expect(markup).toContain('data-window-spaces-is-editing="true"');
  });
});
