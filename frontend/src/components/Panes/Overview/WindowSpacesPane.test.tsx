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

type MockProjectState = {
  sections: Record<string, { name: string }>;
  projectConfig: {
    id: string;
    name: string;
    windowSpaceSlugsById?: Record<string, string>;
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
    windowSpaceSlugsById: {},
    windowSpaces: {},
  },
  projectChatWindowing: {
    instancesById: {},
  },
};

vi.mock("components/Pages/Project/ViewModeDnd", () => ({
  SortableListProvider: ({ children }: { children: ReactNode }) => children,
  useSortableListItem: () => ({
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

vi.mock("state/actions/windowSpaces", async () => {
  const actual = await vi.importActual<
    typeof import("state/actions/windowSpaces")
  >("state/actions/windowSpaces");
  return {
    ...actual,
    createWindowSpaceFromCurrentFloatingWindows: () =>
      createWindowSpaceFromCurrentFloatingWindowsMock(),
    persistWindowSpaceSortOrder: (...args: unknown[]) =>
      persistWindowSpaceSortOrderMock(...args),
    restoreWindowSpaceInWorkspace: (...args: unknown[]) =>
      restoreWindowSpaceInWorkspaceMock(...args),
    setWindowSpaceName: (...args: unknown[]) => setWindowSpaceNameMock(...args),
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
    mockProjectState = {
      sections: {},
      projectConfig: {
        id: "project-config-id",
        name: "Project Alpha",
        windowSpaceSlugsById: {
          "window-space-a": "research-board",
          "window-space-b": "alpha-review",
        },
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

  it("submits conflicting window-space renames to the backend and shows the backend error", async () => {
    setWindowSpaceNameMock.mockResolvedValue({
      data: {
        detail:
          "Window space name 'Alpha Review' conflicts with existing window space 'Alpha Review'.",
      },
      hasResponse: true,
      status: 400,
    });

    await act(async () => {
      root.render(<WindowSpacesPane isEditing={false} canEditLayout={true} />);
    });

    const renameButtons = host.querySelectorAll(
      '[data-testid="window-space-rename"]',
    );
    expect(renameButtons).toHaveLength(2);

    await act(async () => {
      (renameButtons[0] as HTMLButtonElement).click();
    });

    const input = host.querySelector(
      '[data-testid="window-space-name-input"]',
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();

    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, "Alpha Review");
      input?.dispatchEvent(new Event("input", { bubbles: true }));
    });

    await act(async () => {
      input?.focus();
      input?.blur();
    });

    expect(setWindowSpaceNameMock).toHaveBeenCalledTimes(1);
    expect(setWindowSpaceNameMock).toHaveBeenCalledWith(
      "project-config-id",
      "window-space-a",
      "Alpha Review",
    );
    expect(host.textContent).toContain(
      "Window space name 'Alpha Review' conflicts with existing window space 'Alpha Review'.",
    );
  });
});
