import { renderToStaticMarkup } from "react-dom/server";
import {
  ChatWindowPlacementEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WindowSpacesPane } from "./WindowSpacesPane";

type MockProjectState = {
  sections: Record<string, { name: string }>;
  projectConfig: {
    id: string;
    name: string;
    windowSpaces?: Record<string, ReturnType<typeof createWindowSpaceConfig>>;
  };
  projectChatWindowing: {
    instancesById: Record<
      string,
      {
        placement: string;
        isClosed: boolean;
        isMinimized: boolean;
        isMaximized: boolean;
        sectionIdOrNull: string | null;
      }
    >;
  };
};

let mockProjectState: MockProjectState = {
  sections: {},
  projectConfig: {
    id: "project-config-id",
    name: "Project Alpha",
    windowSpaces: {},
  },
  projectChatWindowing: {
    instancesById: {},
  },
};

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  ViewModeSortableProvider: ({ children }: { children: unknown }) => children,
  useViewModeSortableItem: () => ({
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    setActivatorNodeRef: () => {},
    style: {},
    isDragging: false,
  }),
}));

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

describe("WindowSpacesPane", () => {
  beforeEach(() => {
    mockProjectState = {
      sections: {},
      projectConfig: {
        id: "project-config-id",
        name: "Project Alpha",
        windowSpaces: {
          "window-space-id": createWindowSpaceConfig({
            id: "window-space-id",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
        },
      },
      projectChatWindowing: {
        instancesById: {
          "floating-window": {
            placement: ChatWindowPlacementEnum.floating,
            isClosed: false,
            isMinimized: false,
            isMaximized: false,
            sectionIdOrNull: null,
          },
        },
      },
    };
  });

  it("renders rename and delete actions on saved spaces outside edit mode", () => {
    const markup = renderToStaticMarkup(
      <WindowSpacesPane isEditing={false} canEditStructure />,
    );

    expect(markup).toContain('data-testid="window-space-open"');
    expect(markup).toContain('data-testid="window-space-open-new-tab"');
    expect(markup).toContain('data-testid="window-space-rename"');
    expect(markup).toContain('data-testid="window-space-delete"');
    expect(markup).not.toContain('data-testid="window-space-edit-row"');
  });
});
