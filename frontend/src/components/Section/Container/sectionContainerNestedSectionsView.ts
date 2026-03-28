import type { SectionContainerNestedSectionsViewProps } from "./sectionContainerView";

export type SectionContainerNestedSectionsProps =
  SectionContainerNestedSectionsViewProps & {
    isJoinedCodeTerminalGroup: boolean;
  };

export type SectionContainerNestedSectionsView =
  | {
      kind: "direct";
      props: SectionContainerNestedSectionsViewProps;
    }
  | {
      kind: "wrapped";
      props: SectionContainerNestedSectionsViewProps;
      wrapperClassName: string;
    };

export function buildSectionContainerNestedSectionsView({
  sectionId,
  isGroup,
  layoutVariant,
  isJoinedCodeTerminalGroup,
}: SectionContainerNestedSectionsProps): SectionContainerNestedSectionsView {
  const props: SectionContainerNestedSectionsViewProps = {
    sectionId,
    isGroup,
    layoutVariant,
  };

  if (!isJoinedCodeTerminalGroup) {
    return {
      kind: "direct",
      props,
    };
  }

  return {
    kind: "wrapped",
    props,
    wrapperClassName: "-mt-px",
  };
}
