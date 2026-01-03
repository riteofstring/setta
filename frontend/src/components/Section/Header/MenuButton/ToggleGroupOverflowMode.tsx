import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import _ from "lodash";
import { useReactFlow } from "forks/xyflow/core/store";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveSectionImplOfType,
  getCurrProjectConfigId,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { setSectionSize } from "state/actions/sections/sectionSizes";
import { useProjectState, useSectionRefs } from "state/definitions";
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
  size: SectionSize;
  zoom: number;
  isHorizontalOrientation: boolean;
};

function getOverflowSizeUpdate({
  element,
  size,
  zoom,
  isHorizontalOrientation,
}: OverflowSizeUpdateInput): SectionSize | null {
  // Only capture the scroll axis dimension:
  // - Vertical groups: scroll vertically, so capture height
  // - Horizontal groups: scroll horizontally, so capture width
  // Cross-axis is determined by content, so set to "auto"
  if (element) {
    const rect = element.getBoundingClientRect();
    const safeZoom = zoom > 0 ? zoom : 1;
    if (isHorizontalOrientation) {
      return createSectionSize({
        width: Math.round(rect.width / safeZoom),
        height: "auto",
      });
    } else {
      return createSectionSize({
        width: "auto",
        height: Math.round(rect.height / safeZoom),
      });
    }
  }

  // Fallback to existing size if element not available
  if (isHorizontalOrientation && typeof size.width === "number") {
    return createSectionSize({
      width: size.width,
      height: "auto",
    });
  } else if (!isHorizontalOrientation && typeof size.height === "number") {
    return createSectionSize({
      width: "auto",
      height: size.height,
    });
  }

  return null;
}

export function ToggleGroupOverflowMode({
  sectionId,
}: ToggleGroupOverflowModeProps) {
  const { overflowMode, isFrozen, size, isHorizontalOrientation } =
    useProjectState((x) => {
      const impl = getCurrEffectiveSectionImplOfType(
        x,
        sectionId,
        SectionTypeEnum.Group,
      );
      return {
        overflowMode: impl.overflowMode ?? false,
        isFrozen: impl.isFrozen,
        size: impl.size,
        isHorizontalOrientation: impl.isHorizontalOrientation ?? false,
      };
    }, _.isEqual);
  const sectionElement = useSectionRefs((x) => x.withNested[sectionId]);

  function onClick() {
    const nextOverflowMode = !overflowMode;
    const zoom = useReactFlow.getState().transform[2] ?? 1;
    const overflowSizeSnapshot = nextOverflowMode
      ? getOverflowSizeUpdate({
          element: sectionElement,
          size,
          zoom,
          isHorizontalOrientation,
        })
      : null;
    const nextOverflowMinSize = nextOverflowMode ? overflowSizeSnapshot : null;
    const nextSize = nextOverflowMode ? overflowSizeSnapshot : null;

    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveSectionImplValue<"GroupSection">(state, sectionId, {
          overflowMode: nextOverflowMode,
          overflowMinSize: nextOverflowMinSize,
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
          overflowMinSize: nextOverflowMinSize,
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
