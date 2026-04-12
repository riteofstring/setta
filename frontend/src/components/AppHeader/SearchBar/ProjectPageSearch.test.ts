/* @vitest-environment jsdom */

import type {
  AllItemsType,
  ComboboxItemType,
  OnSelectedItemChangeFnType,
} from "components/Utils/Combobox/ComboboxStateReducer";
import {
  act,
  createElement,
  type InputHTMLAttributes,
  type RefObject,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CreateSectionsContextMenuInfo } from "state/actions/sections/createSectionsHelper";
import "testUtils/reactRefreshPreamble";
import { ProjectSearchModeEnum } from "utils/constants";
import { SectionTypeEnum } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const addTemporaryNotificationMock = vi.fn();
const createTopLevelSectionFromImplSpecsMock = vi.fn();
const goToSectionMock = vi.fn();

let currentMode = ProjectSearchModeEnum.commandPalette;
let createSectionGroupsMock: Array<{
  group: string;
  items: Array<CreateSectionsContextMenuInfo>;
}> = [];
let pluginCommandsMock: Array<{
  pluginId: string;
  id: string;
  title: string;
  description?: string;
  run: () => void | Promise<void>;
}> = [];

vi.mock("components/Panes/Overview/ProjectOverview/ProjectOverview", () => ({
  useOverviewListing: () => [],
}));

vi.mock("components/Utils/Combobox/useIdNameCombobox", () => ({
  useIdNameCombobox: <T>({
    allItems,
    onSelectedItemChange,
  }: {
    allItems: AllItemsType<T>;
    onSelectedItemChange: OnSelectedItemChangeFnType<T>;
  }) => ({
    isOpen: allItems.some((group) => group.items.length > 0),
    filteredItems: allItems,
    getMenuProps: () => ({}),
    getInputProps: (
      props: InputHTMLAttributes<HTMLInputElement> & {
        ref?: RefObject<HTMLInputElement | null>;
      },
    ) => {
      const rest = { ...props };
      Reflect.deleteProperty(rest, "ref");
      return rest;
    },
    highlightedIndex: -1,
    getItemProps: ({ item }: { item: ComboboxItemType<T>; index: number }) => ({
      onClick: () => {
        onSelectedItemChange(item.id);
      },
    }),
    itemToString: (item: ComboboxItemType<T> | null) => item?.name ?? "",
    onKeyDown: () => {},
  }),
}));

vi.mock("components/Utils/FloatingBox", () => ({
  getFloatingBoxHandlers: () => ({}),
}));

vi.mock("plugins/runtime", () => ({
  usePluginCommands: () => pluginCommandsMock,
}));

vi.mock("state/actions/notifications", () => ({
  addTemporaryNotification: (...args: unknown[]) =>
    addTemporaryNotificationMock(...args),
}));

vi.mock("state/actions/sections/createSectionsHelper", () => ({
  createTopLevelSectionFromImplSpecs: (...args: unknown[]) =>
    createTopLevelSectionFromImplSpecsMock(...args),
  useCreateSectionsList: () => createSectionGroupsMock,
}));

vi.mock("state/actions/sections/sectionPositions", () => ({
  goToSection: (...args: unknown[]) => goToSectionMock(...args),
}));

vi.mock("state/definitions", () => ({
  useProjectSearch: (selector: (state: { mode: string }) => unknown) =>
    selector({ mode: currentMode }),
  useSettings: (
    selector: (state: {
      shortcuts: {
        searchShortcut: string;
        advancedSearchShortcut: string;
        commandPaletteShortcut: string;
      };
    }) => unknown,
  ) =>
    selector({
      shortcuts: {
        searchShortcut: "mod+f",
        advancedSearchShortcut: "mod+shift+f",
        commandPaletteShortcut: "mod+k",
      },
    }),
}));

vi.mock("state/hooks/search", () => ({
  useUpdateProjectSearch: () => ({
    value: "",
    onChange: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    onKeyDown: vi.fn(),
    currIdx: -1,
    numResults: 0,
  }),
}));

import { ProjectPageSearchBar } from "./ProjectPageSearch";

type RenderedProjectPageSearch = {
  host: HTMLDivElement;
  root: Root;
};

function getRenderedOptions(): NodeListOf<HTMLDDElement> {
  const options = document.body.querySelectorAll("dd");
  if (options.length === 0) {
    throw new Error("Expected command palette options to render.");
  }
  return options;
}

async function renderProjectPageSearchBar(): Promise<RenderedProjectPageSearch> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(createElement(ProjectPageSearchBar));
    });
    await act(async () => {
      await Promise.resolve();
    });
  } catch (error) {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    throw error;
  }

  return { host, root };
}

describe("ProjectPageSearchBar", () => {
  beforeEach(() => {
    currentMode = ProjectSearchModeEnum.commandPalette;
    createSectionGroupsMock = [];
    pluginCommandsMock = [];
    addTemporaryNotificationMock.mockReset();
    createTopLevelSectionFromImplSpecsMock.mockReset();
    goToSectionMock.mockReset();
  });

  afterEach(async () => {
    document.body.innerHTML = "";
  });

  it("renders command palette entries and runs the selected actions", async () => {
    const createSectionItem: CreateSectionsContextMenuInfo = {
      name: "Callable",
      implSpecs: {
        type: SectionTypeEnum.Callable,
      },
    };
    const pluginCommandRun = vi.fn();
    createSectionGroupsMock = [
      {
        group: "Section",
        items: [createSectionItem],
      },
    ];
    pluginCommandsMock = [
      {
        pluginId: "setta-fixture-frontend",
        id: "fixture-command",
        title: "Fixture Command",
        description: "fixture",
        run: pluginCommandRun,
      },
    ];

    const { host, root } = await renderProjectPageSearchBar();

    try {
      const renderedOptions = Array.from(getRenderedOptions());
      const renderedOptionLabels = renderedOptions.map((element) =>
        element.textContent?.trim(),
      );
      expect(renderedOptionLabels).toContain("Callable");
      expect(renderedOptionLabels).toContain(
        "Fixture Command (setta-fixture-frontend)",
      );

      const createOption = renderedOptions[0];
      const pluginOption = renderedOptions[1];
      if (!(createOption instanceof HTMLElement)) {
        throw new Error("Expected create-section option.");
      }
      if (!(pluginOption instanceof HTMLElement)) {
        throw new Error("Expected plugin command option.");
      }

      await act(async () => {
        createOption.click();
        await Promise.resolve();
      });
      expect(createTopLevelSectionFromImplSpecsMock).toHaveBeenCalledWith(
        createSectionItem,
      );

      await act(async () => {
        pluginOption.click();
        await Promise.resolve();
      });
      expect(pluginCommandRun).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("routes duplicate labels through their explicit command ids", async () => {
    const firstPluginSection: CreateSectionsContextMenuInfo = {
      name: "Form",
      commandId: "plugin-section:alpha.plugin:form",
      implSpecs: {
        type: SectionTypeEnum.Plugin,
        pluginId: "alpha.plugin",
        kind: "form",
        data: {},
      },
    };
    const secondPluginSection: CreateSectionsContextMenuInfo = {
      name: "Form",
      commandId: "plugin-section:beta.plugin:form",
      implSpecs: {
        type: SectionTypeEnum.Plugin,
        pluginId: "beta.plugin",
        kind: "form",
        data: {},
      },
    };
    createSectionGroupsMock = [
      {
        group: "Plugins",
        items: [firstPluginSection, secondPluginSection],
      },
    ];

    const { host, root } = await renderProjectPageSearchBar();

    try {
      const renderedOptions = Array.from(getRenderedOptions());
      expect(renderedOptions).toHaveLength(2);

      const firstOption = renderedOptions[0];
      const secondOption = renderedOptions[1];
      if (!(firstOption instanceof HTMLElement)) {
        throw new Error("Expected first plugin option.");
      }
      if (!(secondOption instanceof HTMLElement)) {
        throw new Error("Expected second plugin option.");
      }

      await act(async () => {
        firstOption.click();
        secondOption.click();
        await Promise.resolve();
      });

      expect(createTopLevelSectionFromImplSpecsMock.mock.calls).toEqual([
        [firstPluginSection],
        [secondPluginSection],
      ]);
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });

  it("throws a clear error when command ids collide during render", async () => {
    createSectionGroupsMock = [
      {
        group: "Plugins",
        items: [
          {
            name: "Form",
            commandId: "plugin-section:shared",
            implSpecs: {
              type: SectionTypeEnum.Plugin,
              pluginId: "alpha.plugin",
              kind: "form",
              data: {},
            },
          },
          {
            name: "Other Form",
            commandId: "plugin-section:shared",
            implSpecs: {
              type: SectionTypeEnum.Plugin,
              pluginId: "beta.plugin",
              kind: "form",
              data: {},
            },
          },
        ],
      },
    ];

    await expect(renderProjectPageSearchBar()).rejects.toThrow(
      "Duplicate command palette id",
    );
  });

  it("surfaces sync command failures through the user-facing error notification path", async () => {
    pluginCommandsMock = [
      {
        pluginId: "setta-fixture-frontend",
        id: "fixture-command",
        title: "Fixture Command",
        run: () => {
          throw new Error("sync command failed");
        },
      },
    ];

    const { host, root } = await renderProjectPageSearchBar();

    try {
      const renderedOptions = Array.from(getRenderedOptions());
      const pluginOption = renderedOptions[0];
      if (!(pluginOption instanceof HTMLElement)) {
        throw new Error("Expected plugin command option.");
      }

      await act(async () => {
        pluginOption.click();
        await Promise.resolve();
      });

      expect(addTemporaryNotificationMock).toHaveBeenCalledWith(
        "sync command failed",
        "error",
      );
    } finally {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    }
  });
});
