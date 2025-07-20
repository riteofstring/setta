import { useReactFlow } from "forks/xyflow/core/store";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import {
  useLocalStorage,
  useProjectState,
  useSectionRefs,
  useSettings,
  ZustandProjectState,
} from "state/definitions";
import {
  BaseSectionImplUnion,
  Core,
  createBaseSectionImplUnionWithDiscriminator,
  createCore,
  createLayering,
  createSectionSize,
  createTopLevelSectionLayout,
  getSectionDefault,
  isBaseParentSectionImpl,
  Position,
  SectionSizeModeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { insertIntoArray } from "utils/utils";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { addNodes } from "../nodeInternals";
import {
  getEffectiveSectionImpl,
  setEffectiveSectionImplValue,
} from "../sectionInfos";

type PartialImplWithType = Partial<BaseSectionImplUnion> &
  Required<Pick<BaseSectionImplUnion, "type">>;

type PartialCoreWithIdOrName = Partial<Pick<Core, "id">>;

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
  useProjectState.setState((state) => {
    let parentId: string, parentImpl: BaseSectionImplUnion, startIdx: number;
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

    addChildrenToSeries(
      parentId,
      childImplProps,
      state,
      undefined,
      startIdx,
      numChildren,
    );
  });

  maybeIncrementProjectStateVersion(true);
}

export function addChildrenToSeries(
  parentId: string,
  childImplProps: PartialImplWithType,
  state: ZustandProjectState,
  childCoreProps?: PartialCoreWithIdOrName,
  startIdx?: number,
  numChildren?: number,
) {
  const parentImpl = getEffectiveSectionImpl(state, parentId);
  if (!isBaseParentSectionImpl(parentImpl)) {
    throw new Error();
  }

  const size = createSectionSize({
    height: SectionSizeModeEnum.auto,
    width: parentImpl.size.width,
  });

  const newIds: Array<string> = [];
  if (numChildren === undefined) {
    numChildren = 1;
  }
  for (let x = 0; x < numChildren; x++) {
    newIds.push(
      createSection(
        { parentId, size, ...childImplProps },
        state,
        undefined,
        childCoreProps,
      ),
    );
  }

  if (startIdx === undefined) {
    startIdx = parentImpl.children.length;
  }

  setEffectiveSectionImplValue<"BaseParentSection">(state, parentId, {
    children: (currChildren) =>
      insertIntoArray(currChildren ?? [], startIdx, ...newIds),
  });
}

export function createSection(
  implProps: PartialImplWithType,
  state: ZustandProjectState,
  position?: Position,
  coreProps?: PartialCoreWithIdOrName,
) {
  const sectionDefault = getSectionDefault(
    useSettings.getState(),
    implProps.type,
  );
  const sectionImpl = createBaseSectionImplUnionWithDiscriminator({
    ...sectionDefault,
    ...implProps,
  });
  const sectionImplLayering = createLayering({
    impl: sectionImpl.id,
    nonPresetImpls: sectionImpl.isPreset ? [] : [sectionImpl.id],
  });
  const section = createCore({
    implLayerings: [sectionImplLayering.id],
    defaultImplLayering: sectionImplLayering.id,
    ...coreProps,
  });

  state.projectConfig.sectionImplLayeringMap[section.id] =
    sectionImplLayering.id;
  state.sections[section.id] = section;
  state.sectionImpls[sectionImpl.id] = sectionImpl;
  state.sectionImplLayerings[sectionImplLayering.id] = sectionImplLayering;

  if (!implProps.parentId) {
    const topLevelSectionLayout = createTopLevelSectionLayout(position);
    state.projectConfig.topLevelSections[section.id] = topLevelSectionLayout;
    addNodes([
      {
        id: section.id,
        position,
        zIndex: 0,
        tempZIndex: 0,
        visibility: true,
      },
    ]);
  }

  return section.id;
}
