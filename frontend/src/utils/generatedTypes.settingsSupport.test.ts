import {
  BackgroundVariantEnum,
  createSettingsState,
  MetaControlSizeModeEnum,
  RunSnapshotModeEnum,
  SelectionModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated settings support", () => {
  it("preserves nested defaults when partial settings overrides are applied", () => {
    const settings = createSettingsState({
      shortcuts: {
        searchShortcut: "Ctrl + K",
      },
      gui: {
        gridPattern: BackgroundVariantEnum.cross,
      },
      backend: {
        showDefaultConfigOnLoad: false,
      },
      sectionSizingPolicy: {
        globals: {
          autoMaxHeight: 200,
        },
      },
      languageServer: {
        pylsp: {
          enabled: true,
        },
      },
    });

    expect(settings.shortcuts.searchShortcut).toBe("Ctrl + K");
    expect(settings.shortcuts.saveShortcut).toBe("Mod + S");
    expect(settings.gui.gridPattern).toBe(BackgroundVariantEnum.cross);
    expect(settings.gui.selectionMode).toBe(SelectionModeEnum.partial);
    expect(settings.backend.showDefaultConfigOnLoad).toBe(false);
    expect(settings.backend.runSnapshotMode).toBe(
      RunSnapshotModeEnum.ephemeral,
    );
    expect(settings.sectionSizingPolicy.globals.autoMaxHeight).toBe(200);
    expect(
      settings.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
    ).toBe(36);
    expect(
      settings.sectionSizingPolicy.metaControlByType.DropdownParam
        .sizeModeHeight,
    ).toBe(MetaControlSizeModeEnum.auto_only);
    expect(settings.languageServer).toEqual({
      pylsp: {
        enabled: true,
      },
    });
  });
});
