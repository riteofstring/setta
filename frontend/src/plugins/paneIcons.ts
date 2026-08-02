export const PluginPaneIconNameEnum = {
  extension: "extension",
  folder: "folder",
  git: "git",
  radar: "radar",
  dashboard: "dashboard",
  eye: "eye",
  notifications: "notifications",
  bug: "bug",
  chat: "chat",
  robot: "robot",
} as const;

export type PluginPaneIconName =
  (typeof PluginPaneIconNameEnum)[keyof typeof PluginPaneIconNameEnum];

const PLUGIN_PANE_ICON_NAME_SET = new Set<string>(
  Object.values(PluginPaneIconNameEnum),
);

export function isPluginPaneIconName(
  value: string,
): value is PluginPaneIconName {
  return PLUGIN_PANE_ICON_NAME_SET.has(value);
}
