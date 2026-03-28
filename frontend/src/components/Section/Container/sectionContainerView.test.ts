import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildSectionContainerView } from "./sectionContainerView";

describe("buildSectionContainerView", () => {
  it("returns no view for generated python sections when python codegen is disabled", () => {
    expect(
      buildSectionContainerView({
        sectionId: "section-1",
        visibility: true,
        isEditingViewMode: false,
        isGroup: false,
        isCode: true,
        isUserView: false,
        isGenPython: true,
        isGenPythonMetadata: false,
        hasPythonCodegen: false,
        hasMetadata: false,
        sectionTypeName: SectionTypeEnum.GenPythonCode,
        textBlockMetaControlStyle: false,
        isMinimized: false,
        isJoinedAttachedTerminalGroup: false,
      }),
    ).toEqual({ kind: "none" });
  });

  it("routes standard code sections through the core body boundary with tight nested layout", () => {
    expect(
      buildSectionContainerView({
        sectionId: "section-2",
        visibility: true,
        isEditingViewMode: false,
        isGroup: false,
        isCode: true,
        isUserView: false,
        isGenPython: false,
        isGenPythonMetadata: false,
        hasPythonCodegen: true,
        hasMetadata: true,
        sectionTypeName: SectionTypeEnum.Code,
        textBlockMetaControlStyle: false,
        isMinimized: true,
        isJoinedAttachedTerminalGroup: false,
      }),
    ).toEqual({
      kind: "standard",
      core: {
        props: {
          sectionId: "section-2",
          isUserView: false,
          sectionTypeName: SectionTypeEnum.Code,
          bgColor: "bg-white dark:bg-setta-900",
        },
        bodyProps: {
          sectionId: "section-2",
          sectionTypeName: SectionTypeEnum.Code,
          bgColor: "bg-white dark:bg-setta-900",
          isMinimized: true,
          isUserView: false,
        },
      },
      nestedSectionsProps: {
        sectionId: "section-2",
        isGroup: false,
        layoutVariant: "tight",
      },
    });
  });

  it("routes joined code-terminal groups through the lifted core body boundary with joined corners", () => {
    expect(
      buildSectionContainerView({
        sectionId: "section-3",
        visibility: true,
        isEditingViewMode: false,
        isGroup: false,
        isCode: true,
        isUserView: true,
        isGenPython: false,
        isGenPythonMetadata: false,
        hasPythonCodegen: true,
        hasMetadata: true,
        sectionTypeName: SectionTypeEnum.Code,
        textBlockMetaControlStyle: false,
        isMinimized: false,
        isJoinedAttachedTerminalGroup: true,
      }),
    ).toEqual({
      kind: "joined-code-terminal-group",
      core: {
        props: {
          sectionId: "section-3",
          isUserView: true,
          sectionTypeName: SectionTypeEnum.Code,
          bgColor: "bg-white dark:bg-setta-900",
          forceHideOutline: true,
          hideAgenticEdgeHandles: true,
          omitAgenticHandleScopeClass: true,
          joinedCorners: "code-terminal-parent",
        },
        bodyProps: {
          sectionId: "section-3",
          sectionTypeName: SectionTypeEnum.Code,
          bgColor: "bg-white dark:bg-setta-900",
          isMinimized: false,
          isUserView: true,
        },
      },
      nestedSectionsProps: {
        sectionId: "section-3",
        isGroup: false,
        layoutVariant: "tight",
      },
    });
  });

  it("skips the core renderer for group sections while preserving default nested layout", () => {
    expect(
      buildSectionContainerView({
        sectionId: "section-4",
        visibility: true,
        isEditingViewMode: false,
        isGroup: true,
        isCode: false,
        isUserView: false,
        isGenPython: false,
        isGenPythonMetadata: false,
        hasPythonCodegen: true,
        hasMetadata: true,
        sectionTypeName: SectionTypeEnum.Group,
        textBlockMetaControlStyle: false,
        isMinimized: false,
        isJoinedAttachedTerminalGroup: false,
      }),
    ).toEqual({
      kind: "standard",
      core: null,
      nestedSectionsProps: {
        sectionId: "section-4",
        isGroup: true,
        layoutVariant: "default",
      },
    });
  });
});
