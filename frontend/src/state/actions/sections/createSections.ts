import { useReactFlow } from "forks/xyflow/core/store";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import {
  useLocalStorage,
  useProjectState,
  useSectionRefs,
  ZustandProjectState,
} from "state/definitions";
import { route_create_child_sections } from "utils/generatedEndpoints";
import {
  BaseSectionImplUnion,
  Core,
  isBaseParentSectionImpl,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { getEffectiveSectionImpl } from "../sectionInfos";

export type PartialImplWithType = Partial<BaseSectionImplUnion> &
  Required<Pick<BaseSectionImplUnion, "type">>;

type PartialCoreWithIdOrName = Partial<Pick<Core, "id" | "name">>;

export function addRegularSectionInEmptySpace() {
  let newId;
  useProjectState.setState((state) => {
    newId = addSectionInEmptySpace({
      type: UITypeNameEnum.SECTION,
      state,
    });
  });
  setActiveSectionIdAndUpdateZIndex(newId);
  const unsub = useSectionRefs.subscribe(
    (state) => state.selfOnly[newId],
    (newSectionRef) => {
      if (newSectionRef) {
        focusOnSectionSearch(newId);
      }
      unsub();
    },
  );
  maybeIncrementProjectStateVersion(true);
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
  maybeIncrementProjectStateVersion(true);
}

export function addTerminalInEmptySpace() {
  useProjectState.setState((state) => {
    addSectionInEmptySpace({ type: UITypeNameEnum.TERMINAL, state });
  });
  maybeIncrementProjectStateVersion(true);
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

export function addChildrenToSeriesViaIncrementer(
  isRoot: boolean,
  calledBy: string,
  numChildren: number,
  childImplProps: PartialImplWithType,
) {
  let parentId: string, parentImpl: BaseSectionImplUnion, startIdx: number;
  const state = useProjectState.getState();
  if (isRoot) {
    parentId = calledBy;
    parentImpl = getEffectiveSectionImpl(state, parentId);
    if (!isBaseParentSectionImpl(parentImpl)) {
      throw new Error();
    }
    startIdx = 0;
  } else {
    const impl = getEffectiveSectionImpl(state, calledBy);
    parentId = impl.parentId;
    parentImpl = getEffectiveSectionImpl(state, parentId);
    if (!isBaseParentSectionImpl(parentImpl)) {
      throw new Error();
    }
    startIdx = parentImpl.children.indexOf(calledBy) + 1;
  }

  route_create_child_sections({
    projectConfigId: state.projectConfig.id,
    parentId,
    impl_type: childImplProps.type,
    numChildren,
    startIdx: startIdx,
  });

  // maybeIncrementProjectStateVersion(true);
}
