import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { setSectionSize } from "state/actions/sections/sectionSizes";
import { useProjectState } from "state/definitions";
import { useSectionRefs } from "state/stores/layoutInteractionStores";
import {
  route_set_group_overflow_mode,
  route_set_section_sizes,
} from "utils/generatedEndpoints";
import {
  createSectionSize,
  SectionSize,
  SectionTypeEnum,
} from "utils/generatedTypes";

type ToggleGroupOverflowModeProps = {
  sectionId: string;
};

type OverflowSizeUpdateInput = {
  element: HTMLDivElement | null | undefined;
  nextOverflowMode: boolean;
  size: SectionSize;
};

function getOverflowSizeUpdate({
  element,
  nextOverflowMode,
  size,
}: OverflowSizeUpdateInput): SectionSize | null {
  if (!nextOverflowMode || !element) {
    return null;
  }

  const widthIsAuto = size.width === "auto";
  const heightIsAuto = size.height === "auto";
  if (!widthIsAuto && !heightIsAuto) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  const nextWidth = widthIsAuto ? Math.round(rect.width) : size.width;
  const nextHeight = heightIsAuto ? Math.round(rect.height) : size.height;

  return createSectionSize({
    width: nextWidth,
    height: nextHeight,
  });
}

export function ToggleGroupOverflowMode({
  sectionId,
}: ToggleGroupOverflowModeProps) {
  const { overflowMode, isFrozen, size } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplOfType(
      x,
      sectionId,
      SectionTypeEnum.Group,
    );
    return {
      overflowMode: impl.overflowMode ?? false,
      isFrozen: impl.isFrozen,
      size: impl.size,
    };
  }, _.isEqual);
  const sectionElement = useSectionRefs((x) => x.withNested[sectionId]);

  function onClick() {
    const nextOverflowMode = !overflowMode;
    const nextSize = getOverflowSizeUpdate({
      element: sectionElement,
      nextOverflowMode,
      size,
    });

    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
          overflowMode: nextOverflowMode,
        });
        if (nextSize) {
          setSectionSize(sectionId, nextSize, state);
        }
      },
      send: (frontendOpId) => {
        if (nextSize) {
          void route_set_section_sizes({
            projectConfigId: getCurrProjectConfigId(),
            sectionSizes: { [sectionId]: nextSize },
          });
        }
        return route_set_group_overflow_mode({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          overflowMode: nextOverflowMode,
          frontendOpId,
        });
      },
    });
  }

  const textClassName = overflowMode
    ? "text-blue-600 dark:text-blue-400"
    : undefined;

  return (
    <MenuItem onClick={onClick} disabled={isFrozen}>
      <span className={textClassName}>Overflow Mode</span>
    </MenuItem>
  );
}
