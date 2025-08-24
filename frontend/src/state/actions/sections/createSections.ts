import { useReactFlow } from "forks/xyflow/core/store";
import { useLocalStorage } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import { SectionType, SectionTypeEnum } from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { getCurrProjectConfigId } from "../sectionInfos";

async function addSectionInEmptySpace(
  type: SectionType,
  callback?: (x: string) => void,
) {
  const res = await route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType: type,
    implOverrides: {},
    position: getEmptySpacePosition(),
  });

  if (res200(res)) {
    const newId = res.data;
    callback?.(newId);
  }
}

export function addCallableSectionInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Callable, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
    focusOnSectionSearch(newId);
  });
}

export function addGroupInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Group, (newId) => {
    setActiveSectionIdAndUpdateZIndex(newId);
  });
}

export function addTerminalInEmptySpace() {
  addSectionInEmptySpace(SectionTypeEnum.Terminal);
}

export function getEmptySpacePosition() {
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const positionOffset = { x: 10, y: 10 };
  return { x: x + positionOffset.x, y: y + positionOffset.y };
}
