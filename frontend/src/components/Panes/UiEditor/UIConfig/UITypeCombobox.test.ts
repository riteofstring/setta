import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  mockProjectState: {
    codeObjImpls: {},
  },
}));

vi.mock("utils/generatedTypes", async () => {
  const actual = await vi.importActual<typeof import("utils/generatedTypes")>(
    "utils/generatedTypes",
  );
  return {
    ...actual,
    BaseParamCodeObjImplTypeSet: new Set([actual.CodeObjTypeEnum.DateParam]),
    ControlCodeObjTypeSet: new Set([actual.CodeObjTypeEnum.DateParam]),
    SectionParamCodeObjTypeSet: new Set<string>(),
  };
});

vi.mock("state/definitions", () => ({
  useProjectState: (
    selector: (state: typeof hoisted.mockProjectState) => unknown,
  ) => selector(hoisted.mockProjectState),
}));

vi.mock("state/hooks/share", () => ({
  useShareCapabilities: () => ({
    canEditStructure: true,
  }),
}));

vi.mock("state/actions/sectionInfos", () => ({
  getCodeObjImpl: vi.fn(),
  getCurrCodeObjVariantIfPresent: () => null,
}));

vi.mock("components/Utils/Combobox/IdNameCombobox", () => ({
  IdNameCombobox: ({ allItems }: { allItems: unknown }) =>
    JSON.stringify(allItems),
}));

const { CALENDAR_PRESET_ID, ParamConfigUITypeCombobox } = await import(
  "./UITypeCombobox"
);

function renderCombobox(filterKey: "control" | "sectionParam"): string {
  return renderToStaticMarkup(
    createElement(ParamConfigUITypeCombobox, {
      sectionId: "section-1",
      paramInfoId: "param-1",
      selectedBaseImplId: "",
      codeObjTypeFilterKey: filterKey,
      onDropdownSelect: vi.fn(),
    }),
  );
}

describe("ParamConfigUITypeCombobox", () => {
  it("includes the calendar virtual preset for control params", () => {
    const markup = renderCombobox("control");

    expect(markup).toContain(CALENDAR_PRESET_ID);
    expect(markup).toContain("Calendar - (DateParam)");
  });

  it("does not include calendar presets for section params", () => {
    const markup = renderCombobox("sectionParam");

    expect(markup).not.toContain(CALENDAR_PRESET_ID);
    expect(markup).not.toContain("Calendar - (DateParam)");
  });
});
