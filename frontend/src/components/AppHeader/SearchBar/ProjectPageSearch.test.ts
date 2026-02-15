import { projectPageSearchTestApi } from "components/AppHeader/SearchBar/ProjectPageSearch";
import { type CreateSectionsContextMenuInfo } from "state/actions/sections/createSectionsHelper";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";

describe("project page command palette model", () => {
  it("includes create-section and plugin-command entries with actions", async () => {
    const createSectionItem: CreateSectionsContextMenuInfo = {
      name: "Callable",
      implSpecs: {
        type: SectionTypeEnum.Callable,
      },
    };
    const pluginCommandRun = vi.fn();

    const model = projectPageSearchTestApi.buildProjectCommandPaletteEntries({
      createSectionGroups: [
        {
          group: "Section",
          items: [createSectionItem],
        },
      ],
      pluginCommands: [
        {
          pluginId: "setta-fixture-frontend",
          id: "fixture-command",
          title: "Fixture Command",
          description: "fixture",
          run: pluginCommandRun,
        },
      ],
    });

    expect(model.allItems.map((entry) => entry.group)).toEqual([
      "Section",
      "Plugin Commands",
    ]);
    expect(model.allItems[1]?.items[0]?.name).toBe(
      "Fixture Command (setta-fixture-frontend)",
    );

    const pluginActionId =
      model.allItems[1]?.items[0]?.id ??
      "plugin-command:setta-fixture-frontend:fixture-command";
    const pluginAction = model.actionById[pluginActionId];
    expect(pluginAction).toBeDefined();
    if (!pluginAction) {
      throw new Error("Expected plugin command action to be defined.");
    }
    await Promise.resolve(pluginAction());
    expect(pluginCommandRun).toHaveBeenCalledTimes(1);
  });

  it("uses explicit create-section command ids when provided", () => {
    const model = projectPageSearchTestApi.buildProjectCommandPaletteEntries({
      createSectionGroups: [
        {
          group: "Plugins",
          items: [
            {
              name: "Form",
              commandId: "plugin-section:alpha.plugin:form",
              implSpecs: {
                type: SectionTypeEnum.Plugin,
                pluginId: "alpha.plugin",
                kind: "form",
                data: {},
              },
            },
            {
              name: "Form",
              commandId: "plugin-section:beta.plugin:form",
              implSpecs: {
                type: SectionTypeEnum.Plugin,
                pluginId: "beta.plugin",
                kind: "form",
                data: {},
              },
            },
          ],
        },
      ],
      pluginCommands: [],
    });

    const pluginGroup = model.allItems.find((entry) => entry.group === "Plugins");
    expect(pluginGroup?.items.map((item) => item.id)).toEqual([
      "plugin-section:alpha.plugin:form",
      "plugin-section:beta.plugin:form",
    ]);
    expect(model.actionById["plugin-section:alpha.plugin:form"]).toBeDefined();
    expect(model.actionById["plugin-section:beta.plugin:form"]).toBeDefined();
  });
});
