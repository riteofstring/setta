import {
  BackgroundVariantEnum,
  createSettingsState,
  MetaControlSizeModeEnum,
  PanOnScrollModeEnum,
  RenameRefactorModeEnum,
  RunSnapshotModeEnum,
  SelectionModeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated settings support", () => {
  it("seeds current Go settings defaults for settings-backed callers", () => {
    const settings = createSettingsState();

    expect(settings.shortcuts.searchShortcut).toBe("Mod + K");
    expect(settings.shortcuts.newTerminalShortcut).toBe("Ctrl + `");
    expect(settings.backend.showDefaultConfigOnLoad).toBe(true);
    expect(settings.backend.renameRefactorMode).toBe(
      RenameRefactorModeEnum.ALWAYS_ASK,
    );
    expect(settings.sectionSizingPolicy.byType.Callable.hideSearchMinHeight).toBe(
      42,
    );
    expect(settings.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight).toBe(
      36,
    );
    expect(
      settings.sectionSizingPolicy.metaControlByType.DropdownParam
        .sizeModeHeight,
    ).toBe(MetaControlSizeModeEnum.auto_only);
    expect(settings.languageServer).toEqual({
      basedpyright: {
        analysis: {
          diagnosticSeverityOverrides: {
            reportUnknownVariableType: "none",
            reportUnknownMemberType: "none",
            reportUnannotatedClassAttribute: "none",
            reportSelfClsParameterName: "none",
          },
        },
      },
    });
  });

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
    expect(settings.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight).toBe(
      36,
    );
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

  it("exports settings enums used by layout and rename callers", () => {
    expect(BackgroundVariantEnum.dots).toBe("dots");
    expect(PanOnScrollModeEnum.free).toBe("free");
    expect(SelectionModeEnum.partial).toBe("partial");
    expect(RenameRefactorModeEnum.NEVER_RENAME).toBe("NEVER_RENAME");
  });
});
