import {
  buildPluginPaneOverviewTabName,
  parsePluginPaneOverviewTabName,
} from "utils/constants";
import { describe, expect, it } from "vitest";

describe("plugin overview tab key helpers", () => {
  it("parses encoded plugin and pane ids from plugin tab keys", () => {
    expect(
      parsePluginPaneOverviewTabName(
        "PluginPane:acme%2Fplugin%20alpha:pane%3Aone%2Ftwo",
      ),
    ).toEqual({
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
