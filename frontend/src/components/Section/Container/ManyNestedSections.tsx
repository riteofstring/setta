import { useDndChildren } from "forks/dnd-kit/dndChildren";
import { DNDSortable } from "forks/dnd-kit/DNDSortable";
import {
  getCurrEffectiveSectionImpl,
  getEmbeddedAttachedTerminalForCodeSection,
} from "state/actions/sectionInfos";
import { goToSection } from "state/actions/sections/sectionPositions";
import { useProjectState } from "state/definitions";
import { SectionTypeEnum } from "utils/generatedTypes";
import { SortableSectionContainer } from "./SortableSectionContainer";
import { useHasTempNested } from "./utils";

export function MaybeManyNestedSections({
  sectionId,
  isGroup,
  layoutVariant = "default",
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant?: "default" | "tight";
}) {
  const hasNested = useHasTempNested(sectionId);
  return (
    hasNested && (
      <div className="flex flex-col">
        <ManyNestedSections
          sectionId={sectionId}
          isGroup={isGroup}
          layoutVariant={layoutVariant}
        />
      </div>
    )
  );
}

function ManyNestedSections({
  sectionId,
  isGroup,
  layoutVariant,
}: {
  sectionId: string;
  isGroup: boolean;
  layoutVariant: "default" | "tight";
}) {
  const tempChildIds = useDndChildren((x) => x.x[sectionId] ?? []);
  const hiddenAttachedTerminalId = useProjectState((x) => {
    const embeddedTerminal = getEmbeddedAttachedTerminalForCodeSection(
      x,
      sectionId,
      tempChildIds,
    );
    if (!embeddedTerminal || !embeddedTerminal.isTerminalMinimized) {
      return null;
    }
    return embeddedTerminal.attachedTerminalId;
  });
  const childIds = hiddenAttachedTerminalId
    ? tempChildIds.filter((id) => id !== hiddenAttachedTerminalId)
    : tempChildIds;

  return (
    <DNDSortable sectionId={sectionId} items={childIds}>
      {layoutVariant === "tight" ? (
        <NestedSectionsTight childIds={childIds} />
      ) : (
        <NestedSectionsWithMargin
          childIds={childIds}
          sectionId={sectionId}
          isGroup={isGroup}
        />
      )}
    </DNDSortable>
  );
}

function NestedSectionsTight({ childIds }: { childIds: string[] }) {
  return (
    <div className="flex w-full flex-col">
      {childIds.map((e) => (
        <SortableSectionContainer
          sectionId={e}
          key={`Nested-Sec-${e}`}
          className="w-full"
        />
      ))}
    </div>
  );
}

function NestedSectionsWithMargin({ childIds, sectionId, isGroup }) {
  const onClick = () => {
    goToSection(sectionId);
  };

  const isHorizontalOrientation = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.type === SectionTypeEnum.Group && impl.isHorizontalOrientation;
  });

  return (
    <div className="flex items-stretch">
      {!isGroup && (
        <div
          className={`mr-2 mt-2 min-h-full w-2 rounded-full bg-white/30 transition-all duration-75 hover:cursor-pointer hover:bg-white/50 dark:bg-setta-700 hover:dark:bg-setta-600`}
          onClick={onClick}
        />
      )}
      <div
        className={`mt-2 flex ${isHorizontalOrientation ? "flex-row" : "flex-col "} items-start gap-2`}
      >
        {childIds.map((e) => (
          <SortableSectionContainer sectionId={e} key={`Nested-Sec-${e}`} />
        ))}
      </div>
    </div>
  );
}
