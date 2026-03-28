import { getSectionShouldRender } from "state/actions/sectionInfos";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";
import type { SectionContainerCoreBodyProps } from "./sectionContainerCoreBodyView";
import { getBgColor } from "./utils";

export type SectionContainerCoreViewProps = {
  sectionId: string;
  isUserView: boolean;
  forceHideOutline?: boolean;
  hideAgenticEdgeHandles?: boolean;
  omitAgenticHandleScopeClass?: boolean;
  joinedCorners?: "none" | "code-terminal-parent";
};

export type SectionContainerNestedSectionsViewProps = {
  sectionId: string;
  isGroup: boolean;
  layoutVariant: "default" | "tight";
};

type SectionContainerViewInput = {
  sectionId: string;
  visibility: boolean;
  isEditingViewMode: boolean;
  isGroup: boolean;
  isCode: boolean;
  isUserView: boolean;
  isGenPython: boolean;
  isGenPythonMetadata: boolean;
  hasPythonCodegen: boolean;
  hasMetadata: boolean;
  sectionTypeName: SectionType;
  textBlockMetaControlStyle: boolean;
  isMinimized: boolean;
  isJoinedAttachedTerminalGroup: boolean;
};

type SectionContainerCoreView = {
  props: SectionContainerCoreViewProps;
  bodyProps: SectionContainerCoreBodyProps;
};

export type SectionContainerView =
  | { kind: "none" }
  | {
      kind: "joined-code-terminal-group";
      core: SectionContainerCoreView;
      nestedSectionsProps: SectionContainerNestedSectionsViewProps & {
        layoutVariant: "tight";
      };
    }
  | {
      kind: "standard";
      core: SectionContainerCoreView | null;
      nestedSectionsProps: SectionContainerNestedSectionsViewProps;
    };

export function buildSectionContainerView({
  sectionId,
  visibility,
  isEditingViewMode,
  isGroup,
  isCode,
  isUserView,
  isGenPython,
  isGenPythonMetadata,
  hasPythonCodegen,
  hasMetadata,
  sectionTypeName,
  textBlockMetaControlStyle,
  isMinimized,
  isJoinedAttachedTerminalGroup,
}: SectionContainerViewInput): SectionContainerView {
  if (isGenPython && !hasPythonCodegen) {
    return { kind: "none" };
  }
  if (isGenPythonMetadata && !hasMetadata) {
    return { kind: "none" };
  }
  if (!getSectionShouldRender(visibility, isEditingViewMode)) {
    return { kind: "none" };
  }

  const useMetaControlStyle =
    sectionTypeName === SectionTypeEnum.MetaControl || textBlockMetaControlStyle;
  const bodyProps: SectionContainerCoreBodyProps = {
    sectionId,
    sectionTypeName,
    bgColor: useMetaControlStyle ? "bg-transparent" : getBgColor(sectionTypeName),
    isMinimized,
    isUserView,
  };
  const nestedSectionsProps: SectionContainerNestedSectionsViewProps = {
    sectionId,
    isGroup,
    layoutVariant: isCode ? "tight" : "default",
  };

  if (isJoinedAttachedTerminalGroup && !isGroup) {
    return {
      kind: "joined-code-terminal-group",
      core: {
        props: {
          sectionId,
          isUserView,
          forceHideOutline: true,
          hideAgenticEdgeHandles: true,
          omitAgenticHandleScopeClass: true,
          joinedCorners: "code-terminal-parent",
        },
        bodyProps,
      },
      nestedSectionsProps: {
        ...nestedSectionsProps,
        layoutVariant: "tight",
      },
    };
  }

  return {
    kind: "standard",
    core: isGroup
      ? null
      : {
          props: {
            sectionId,
            isUserView,
          },
          bodyProps,
        },
    nestedSectionsProps,
  };
}
