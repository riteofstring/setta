import {
  buildPluginPaneOverviewTabName,
  parsePluginPaneOverviewTabName,
  REQUIRED_UI_EDITOR_TABS,
  UIEditorTabNameEnum,
} from "utils/constants/panes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("plugin overview tab key helpers", () => {
  it("round-trips plugin and pane ids through encoded tab keys", () => {
    const tabKey = buildPluginPaneOverviewTabName(
      "acme/plugin alpha",
      "pane:one/two",
    );

    expect(parsePluginPaneOverviewTabName(tabKey)).toEqual({
      pluginId: "acme/plugin alpha",
      paneId: "pane:one/two",
    });
  });

  it("keeps encodeURIComponent-safe punctuation unescaped in tab keys", () => {
    const tabKey = buildPluginPaneOverviewTabName(
      "plugin!~*'() /",
      "pane!~*'() :?",
    );

    expect(tabKey).toBe("PluginPane:plugin!~*'()%20%2F:pane!~*'()%20%3A%3F");
  });

  it("returns null for non-plugin tab keys and malformed values", () => {
    expect(parsePluginPaneOverviewTabName("Overview")).toBeNull();
    expect(parsePluginPaneOverviewTabName("PluginPane:only-plugin")).toBeNull();
    expect(
      parsePluginPaneOverviewTabName("PluginPane:plugin:%E0%A4%A"),
    ).toBeNull();
  });
});

describe("required ui editor tabs compatibility", () => {
  it("includes every section type in the shared compatibility payload", () => {
    const sectionTypes = Object.values(SectionTypeEnum);

    expect(Object.keys(REQUIRED_UI_EDITOR_TABS).sort()).toEqual(
      sectionTypes.slice().sort(),
    );
  });

  it("keeps expected tab compatibility for representative section types", () => {
    expect(REQUIRED_UI_EDITOR_TABS[SectionTypeEnum.Callable]).toEqual([
      UIEditorTabNameEnum.SectionConfig,
      UIEditorTabNameEnum.UIConfig,
      UIEditorTabNameEnum.QuickInfoConfig,
      UIEditorTabNameEnum.SectionVariantsConfig,
    ]);
    expect(REQUIRED_UI_EDITOR_TABS[SectionTypeEnum.TextBlock]).toEqual([
      UIEditorTabNameEnum.SectionConfig,
      UIEditorTabNameEnum.InfoConfig,
      UIEditorTabNameEnum.SectionVariantsConfig,
    ]);
    expect(REQUIRED_UI_EDITOR_TABS[SectionTypeEnum.IFrame]).toEqual([]);
  });
});
