/* @vitest-environment jsdom */

import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ChatWindowPlacementEnum,
  createWindowSpaceConfig,
} from "utils/generatedTypes";
import { WindowSpacesPane } from "./WindowSpacesPane";

const createWindowSpaceFromCurrentFloatingWindowsMock = vi.fn();
const persistWindowSpaceSortOrderMock = vi.fn();
const restoreWindowSpaceInWorkspaceMock = vi.fn();
const setWindowSpaceNameMock = vi.fn();
const deleteWindowSpaceMock = vi.fn();

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

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: MockProjectState) => unknown,
    _equalityFn?: unknown,
  ) => selector(mockProjectState),
}));

vi.mock("state/actions/windowSpacePersistence", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/windowSpacePersistence")
  >("state/actions/windowSpacePersistence");
  return {
    ...actual,
    createWindowSpaceFromCurrentFloatingWindows: () =>
      createWindowSpaceFromCurrentFloatingWindowsMock(),
    persistWindowSpaceSortOrder: (...args: unknown[]) =>
      persistWindowSpaceSortOrderMock(...args),
    setWindowSpaceName: (...args: unknown[]) => setWindowSpaceNameMock(...args),
    deleteWindowSpace: (...args: unknown[]) => deleteWindowSpaceMock(...args),
  };
});

vi.mock("state/actions/windowSpaces", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/windowSpaces")
  >("state/actions/windowSpaces");
  return {
    ...actual,
    restoreWindowSpaceInWorkspace: (...args: unknown[]) =>
      restoreWindowSpaceInWorkspaceMock(...args),
  };
});

describe("WindowSpacesPane", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    createWindowSpaceFromCurrentFloatingWindowsMock.mockReset();
    persistWindowSpaceSortOrderMock.mockReset();
    restoreWindowSpaceInWorkspaceMock.mockReset();
    setWindowSpaceNameMock.mockReset();
    deleteWindowSpaceMock.mockReset();
    mockProjectState = {
      sections: {},
      projectConfig: {
        id: "project-config-id",
        name: "Project Alpha",
        windowSpaces: {
          "window-space-a": createWindowSpaceConfig({
            id: "window-space-a",
            name: "Research Board",
            sortIndex: 0,
            windowsById: {},
            order: [],
          }),
          "window-space-b": createWindowSpaceConfig({
            id: "window-space-b",
            name: "Alpha Review",
            sortIndex: 1,
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
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  it("enables save, restore, rename, delete, and reorder when layout edits are allowed", async () => {
    await act(async () => {
      root.render(<WindowSpacesPane isEditing={true} canEditLayout={true} />);
    });

    const saveButton = host.querySelector(
      '[data-testid="window-space-save-current-layout"]',
    ) as HTMLButtonElement | null;
    const restoreButtons = host.querySelectorAll(
      '[data-testid="window-space-edit-open"]',
    );
    const deleteButtons = host.querySelectorAll(
      '[data-testid="window-space-delete"]',
    );
    const dragHandles = host.querySelectorAll(
      '[data-testid="window-space-drag-handle"]',
    );

    expect(saveButton?.disabled).toBe(false);
    expect((restoreButtons[0] as HTMLButtonElement | undefined)?.disabled).toBe(
      false,
    );
    expect((deleteButtons[0] as HTMLButtonElement | undefined)?.disabled).toBe(
      false,
    );
    expect(dragHandles).toHaveLength(2);
  });

  it("renders non-edit rows and disables mutating window-space controls when layout edits are disallowed", async () => {
    await act(async () => {
      root.render(<WindowSpacesPane isEditing={true} canEditLayout={false} />);
    });

    const saveButton = host.querySelector(
      '[data-testid="window-space-save-current-layout"]',
    ) as HTMLButtonElement | null;
    const restoreButton = host.querySelector(
      '[data-testid="window-space-open"]',
    ) as HTMLButtonElement | null;

    expect(saveButton?.disabled).toBe(true);
    expect(restoreButton?.disabled).toBe(true);
    expect(
      host.querySelector('[data-testid="window-space-edit-row"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="window-space-drag-handle"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="window-space-rename"]'),
    ).toBeNull();
    expect(
      host.querySelector('[data-testid="window-space-delete"]'),
    ).toBeNull();

    await act(async () => {
      restoreButton?.click();
    });
    expect(restoreWindowSpaceInWorkspaceMock).not.toHaveBeenCalled();
  });
});
