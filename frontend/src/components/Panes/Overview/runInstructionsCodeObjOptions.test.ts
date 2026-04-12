import { describe, expect, it, vi } from "vitest";

import {
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImpl,
} from "state/actions/sectionInfos";
import type { ZustandProjectState } from "state/definitions";
import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  type BaseSectionImplUnion,
} from "utils/generatedTypes";

import { getRunInstructionsCodeObjOptions } from "./runInstructionsCodeObjOptions";

vi.mock("state/actions/sectionInfos", () => ({
  getCurrEffectiveSectionImpl: vi.fn(),
  getCurrEffectiveCodeObjImplIfPresent: vi.fn(),
}));

describe("getRunInstructionsCodeObjOptions", () => {
  it("dedupes, filters, and sorts visible run-instruction code object options", () => {
    const baseSectionImpl = {
      type: SectionTypeEnum.Callable,
      codeObjVariantMap: {
        "code-obj-zeta": "variant-zeta",
        "code-obj-shared": "variant-shared",
        "code-obj-callable": "variant-callable",
        "code-obj-missing-impl": "variant-missing-impl",
      },
    } as BaseSectionImplUnion;
    const metaControlSectionImpl = {
      type: SectionTypeEnum.MetaControl,
      metaControlParamId: "code-obj-alpha",
    } as BaseSectionImplUnion;
    const state = {
      sections: {
        "section-beta": { name: "Beta Section" },
        "section-alpha": { name: "Alpha Section" },
      },
      codeObjs: {
        "code-obj-zeta": { name: "Zeta Param" },
        "code-obj-shared": { name: "Shared Param" },
        "code-obj-callable": { name: "Callable Param" },
        "code-obj-missing-impl": { name: "Missing Impl" },
        "code-obj-alpha": { name: "Alpha Param" },
      },
    } as ZustandProjectState;

    vi.mocked(getCurrEffectiveSectionImpl).mockImplementation((_, sectionId) =>
      sectionId === "section-beta" ? baseSectionImpl : metaControlSectionImpl,
    );
    vi.mocked(getCurrEffectiveCodeObjImplIfPresent).mockImplementation(
      (_, sectionId, codeObjId) => {
        if (sectionId === "section-beta" && codeObjId === "code-obj-zeta") {
          return { type: CodeObjTypeEnum.TextParam } as ReturnType<
            typeof getCurrEffectiveCodeObjImplIfPresent
          >;
        }
        if (sectionId === "section-beta" && codeObjId === "code-obj-shared") {
          return { type: CodeObjTypeEnum.DropdownParam } as ReturnType<
            typeof getCurrEffectiveCodeObjImplIfPresent
          >;
        }
        if (sectionId === "section-beta" && codeObjId === "code-obj-callable") {
          return { type: CodeObjTypeEnum.CodeCallable } as ReturnType<
            typeof getCurrEffectiveCodeObjImplIfPresent
          >;
        }
        if (sectionId === "section-alpha" && codeObjId === "code-obj-alpha") {
          return { type: CodeObjTypeEnum.SliderParam } as ReturnType<
            typeof getCurrEffectiveCodeObjImplIfPresent
          >;
        }
        return null;
      },
    );

    expect(getRunInstructionsCodeObjOptions(state)).toEqual([
      {
        id: "code-obj-alpha",
        name: "Alpha Param",
        type: CodeObjTypeEnum.SliderParam,
        sectionName: "Alpha Section",
        label: "Alpha Section / Alpha Param",
      },
      {
        id: "code-obj-shared",
        name: "Shared Param",
        type: CodeObjTypeEnum.DropdownParam,
        sectionName: "Beta Section",
        label: "Beta Section / Shared Param",
      },
      {
        id: "code-obj-zeta",
        name: "Zeta Param",
        type: CodeObjTypeEnum.TextParam,
        sectionName: "Beta Section",
        label: "Beta Section / Zeta Param",
      },
    ]);
  });
});
