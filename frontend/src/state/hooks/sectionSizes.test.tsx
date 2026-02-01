import { SectionSizingPolicy, SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  applyCompactMinScale,
  getMaxSectionHeight,
  getMaxSectionWidth,
  getMinSectionHeight,
  getMinSectionWidth,
} from "./sectionSizes";

const META_MODE_ANY = "any" as const;

function makeBaseEntry(
  overrides: Partial<SectionSizingPolicy["byType"]["Dict"]> = {},
) {
  return {
    minHeight: 10,
    maxHeight: 1000,
    minWidth: 20,
    maxWidth: 2000,
    ...overrides,
  };
}

function makeCallableEntry() {
  return {
    minHeight: 100,
    maxHeight: 1000,
    minWidth: 200,
    maxWidth: 2000,
    hideSearchMinHeight: 80,
    hideParamsMinHeight: 40,
  };
}

function makeMetaEntry(overrides = {}) {
  return {
    minHeight: 30,
    minWidth: 40,
    sizeModeHeight: META_MODE_ANY,
    sizeModeWidth: META_MODE_ANY,
    ...overrides,
  };
}

function buildSizingPolicy(): SectionSizingPolicy {
  return {
    byType: {
      Callable: makeCallableEntry(),
      Dict: makeBaseEntry(),
      ListRoot: makeBaseEntry(),
      Group: makeBaseEntry(),
      Image: makeBaseEntry(),
      Chart: makeBaseEntry({ minHeight: 300, minWidth: 300 }),
      Draw: makeBaseEntry(),
      TextBlock: makeBaseEntry({ minHeight: 98, minWidth: 200 }),
      MetaControl: makeBaseEntry({ minHeight: 20, minWidth: 200 }),
      Social: makeBaseEntry(),
      GlobalVariables: makeBaseEntry(),
      Code: makeBaseEntry(),
      GenPythonCode: makeBaseEntry(),
      GenPythonMetadata: makeBaseEntry(),
      Terminal: makeBaseEntry(),
      IFrame: makeBaseEntry(),
      Chat: makeBaseEntry(),
      Browser: makeBaseEntry(),
    },
    metaControlByType: {
      CodeCallable: makeMetaEntry(),
      CodeParam: makeMetaEntry(),
      TextParam: makeMetaEntry(),
      ButtonParam: makeMetaEntry(),
      SliderParam: makeMetaEntry({ sizeModeHeight: "auto_only" as const }),
      RotaryParam: makeMetaEntry(),
      SwitchParam: makeMetaEntry(),
      ColorPickerParam: makeMetaEntry(),
      DropdownParam: makeMetaEntry({ sizeModeHeight: "auto_only" as const }),
      PasswordParam: makeMetaEntry({ sizeModeHeight: "auto_only" as const }),
      TextAreaParam: makeMetaEntry(),
      DropzoneParam: makeMetaEntry(),
      NestedParam: makeMetaEntry(),
    },
    globals: {
      pinnedParamsAreaMinHeight: 64,
      unpinnedParamsAreaMinHeight: 38,
      minimizedHeight: 32,
      infiniteMaxHeight: 100000,
      infiniteMaxWidth: 100000,
      autoMaxHeight: 350,
    },
  };
}

describe("section sizing helpers", () => {
  const sizingPolicy = buildSizingPolicy();

  it("returns minimized height when minimized", () => {
    const result = getMinSectionHeight({
      sectionType: SectionTypeEnum.Callable,
      isMinimized: true,
      sizingPolicy,
    });
    expect(result).toBe(sizingPolicy.globals.minimizedHeight);
  });

  it("uses callable hideSearchMinHeight when hideSearch is true", () => {
    const result = getMinSectionHeight({
      sectionType: SectionTypeEnum.Callable,
      hideSearch: true,
      hideParams: true,
      sizingPolicy,
    });
    expect(result).toBe(sizingPolicy.byType.Callable.hideSearchMinHeight);
  });

  it("uses callable hideParamsMinHeight when hideParams is true", () => {
    const result = getMinSectionHeight({
      sectionType: SectionTypeEnum.Callable,
      hideParams: true,
      sizingPolicy,
    });
    expect(result).toBe(sizingPolicy.byType.Callable.hideParamsMinHeight);
  });

  it("returns policy minHeight when not minimized", () => {
    const result = getMinSectionHeight({
      sectionType: SectionTypeEnum.Chart,
      sizingPolicy,
    });
    expect(result).toBe(sizingPolicy.byType.Chart.minHeight);
  });

  it("returns minimized height for max height when minimized", () => {
    const result = getMaxSectionHeight({
      sectionType: SectionTypeEnum.Chart,
      isMinimized: true,
      sizingPolicy,
    });
    expect(result).toBe(sizingPolicy.globals.minimizedHeight);
  });

  it("returns policy min/max width", () => {
    const minWidth = getMinSectionWidth({
      sectionType: SectionTypeEnum.Chart,
      sizingPolicy,
    });
    const maxWidth = getMaxSectionWidth({
      sectionType: SectionTypeEnum.Chart,
      sizingPolicy,
    });
    expect(minWidth).toBe(sizingPolicy.byType.Chart.minWidth);
    expect(maxWidth).toBe(sizingPolicy.byType.Chart.maxWidth);
  });

  it("applies compact scaling for TextBlock", () => {
    const result = applyCompactMinScale({
      sectionType: SectionTypeEnum.TextBlock,
      minHeight: 100,
      minWidth: 200,
    });
    expect(result).toEqual({ minHeight: 50, minWidth: 100 });
  });

  it("does not apply compact scaling when minimized", () => {
    const result = applyCompactMinScale({
      sectionType: SectionTypeEnum.TextBlock,
      isMinimized: true,
      minHeight: 100,
      minWidth: 200,
    });
    expect(result).toEqual({ minHeight: 100, minWidth: 200 });
  });

  it("does not apply compact scaling for other section types", () => {
    const result = applyCompactMinScale({
      sectionType: SectionTypeEnum.Chart,
      minHeight: 100,
      minWidth: 200,
    });
    expect(result).toEqual({ minHeight: 100, minWidth: 200 });
  });
});
