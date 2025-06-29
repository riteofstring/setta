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
  createBaseSectionCoreUnionWithDiscriminator,
  createBaseSectionImplUnionWithDiscriminator,
  createImplLayering,
  createSectionSize,
  createTopLevelSectionLayout,
  getSectionDefault,
  isBaseParentSectionImpl,
  isBaseParentSectionImplModifier,
  Position,
  SectionSizeModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { insertIntoArray } from "utils/utils";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { addNodes } from "../nodeInternals";
import {
  getEffectiveSectionImpl,
  getSectionImplLayering,
} from "../sectionInfos";

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

export function addSectionInEmptySpace({
  type,
  sectionProps = {},
  sectionVariantProps = {},
  positionOffset = { x: 10, y: 10 },
  state,
}) {
  const {
    transform: [_x, _y, zoom],
  } = useReactFlow.getState();
  const overviewWidth = useLocalStorage.getState().overviewTrueWidth;

  const x = (overviewWidth - _x) / zoom;
  const y = -_y / zoom;

  const position = { x: x + positionOffset.x, y: y + positionOffset.y };

  return addSectionAtPosition({
    type,
    sectionProps,
    sectionVariantProps,
    position,
    state,
  });
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

export function addChildrenToSeries(
  isRoot: boolean,
  calledBy: string,
  numChildren: number,
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
      parentId = impl.parentId!;
      parentImpl = getEffectiveSectionImpl(state, parentId);
      if (!isBaseParentSectionImpl(parentImpl)) {
        throw new Error();
      }
      startIdx = parentImpl.children.indexOf(calledBy) + 1;
    }

    const size = createSectionSize({
      height: SectionSizeModeEnum.auto,
      width: parentImpl.size.width,
    });

    const newIds: Array<string> = [];
    for (let x = 0; x < numChildren; x++) {
      newIds.push(
        createSection(
          { parentId, size, type: SectionTypeEnum.Callable },
          state,
        ),
      );
    }

    const parentImplLayering = getSectionImplLayering(state, parentId);
    if (!isBaseParentSectionImplModifier(parentImplLayering.modifier)) {
      throw new Error();
    }
    parentImplLayering.modifier.children = insertIntoArray(
      parentImplLayering.modifier.children ?? [],
      startIdx,
      ...newIds,
    );
  });

  maybeIncrementProjectStateVersion(true);
}

export function createSection(
  sectionProps: Partial<BaseSectionImplUnion>,
  state: ZustandProjectState,
  position?: Position,
) {
  const sectionDefault = getSectionDefault(
    useSettings.getState(),
    sectionProps.type,
  );
  const sectionImpl = createBaseSectionImplUnionWithDiscriminator({
    ...sectionDefault,
    ...sectionProps,
  });
  const sectionImplLayering = createImplLayering({
    impl: sectionImpl.id,
    modifier: { type: sectionImpl.type },
  });
  const section = createBaseSectionCoreUnionWithDiscriminator({
    type: sectionProps.type,
    implLayerings: [sectionImplLayering.id],
    defaultImplLayering: sectionImplLayering.id,
  });

  state.projectConfig.sectionImplLayeringMap[section.id] =
    sectionImplLayering.id;
  state.sections[section.id] = section;
  state.sectionImpls[sectionImpl.id] = sectionImpl;
  state.sectionImplLayerings[sectionImplLayering.id] = sectionImplLayering;

  if (!sectionProps.parentId) {
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
