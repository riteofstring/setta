import { useReactFlow } from "forks/xyflow/core/store";
import {
  useLocalStorage,
  useProjectState,
  ZustandProjectState,
} from "state/definitions";
import { res200 } from "utils/endpointUtils";
import { route_create_top_level_section } from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  Core,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { getCurrProjectConfigId } from "../sectionInfos";

export type PartialImplWithType = Partial<BaseSectionImplUnion> &
  Required<Pick<BaseSectionImplUnion, "type">>;

type PartialCoreWithIdOrName = Partial<Pick<Core, "id" | "name">>;

export async function addCallableSectionInEmptySpace() {
  const res = await route_create_top_level_section({
    projectConfigId: getCurrProjectConfigId(),
    implType: SectionTypeEnum.Callable,
    implOverrides: {},
    position: { x: 0, y: 0 },
  });

  if (res200(res)) {
    const newId = res.data;
    setActiveSectionIdAndUpdateZIndex(newId);
    focusOnSectionSearch(newId);
  }
}

export function addGroupInEmptySpace() {
  let newId;
  useProjectState.setState((state) => {
    newId = addSectionInEmptySpace({
      type: UITypeNameEnum.GROUP,
      state,
    });
  });
  setActiveSectionIdAndUpdateZIndex(newId);
}

export function addTerminalInEmptySpace() {
  useProjectState.setState((state) => {
    addSectionInEmptySpace({ type: UITypeNameEnum.TERMINAL, state });
  });
}

export function addSectionInEmptySpace(
  sectionProps: PartialImplWithType,
  state: ZustandProjectState,
  coreProps?: PartialCoreWithIdOrName,
) {
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const positionOffset = { x: 10, y: 10 };
  const position = { x: x + positionOffset.x, y: y + positionOffset.y };

  return createSection(sectionProps, state, position, coreProps);
}

export function addSectionAtPosition({
  type,
  sectionProps = {},
  sectionVariantProps = {},
  position,
  state,
}) {
  const [newId] = createSectionInfo({
    sectionProps: { ...sectionProps, uiTypeId: BASE_UI_TYPE_IDS[type] },
    sectionVariantProps,
    position,
    state,
  });
  return newId;
}
