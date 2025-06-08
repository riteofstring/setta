import { useReactFlow } from "forks/xyflow/core/store";
import { addNodes } from "state/actions/nodeInternals";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import {
  useLocalStorage,
  useProjectState,
  useSectionRefs,
} from "state/definitions";
import { BASE_UI_TYPE_IDS } from "utils/baseUITypes";
import {
  createSection,
  createSectionConfig,
  createSectionVariant,
  UITypeNameSchema,
} from "utils/generatedTypes";
import { focusOnSectionSearch } from "utils/tabbingLogic";
import { insertIntoArray } from "utils/utils";
import { setActiveSectionIdAndUpdateZIndex } from "../activeSections";
import { addChatHistoryArtifact, addDrawAreaLayer } from "../artifacts";
import {
  getCurrentSectionConfigs,
  setSectionVariantChildren,
} from "../sectionInfos";

export function addRegularSectionInEmptySpace() {
  let newId;
  useProjectState.setState((state) => {
    newId = addSectionInEmptySpace({
      type: UITypeNameSchema.enum.SECTION,
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
      type: UITypeNameSchema.enum.GROUP,
      state,
    });
  });
  setActiveSectionIdAndUpdateZIndex(newId);
  maybeIncrementProjectStateVersion(true);
}

export function addTerminalInEmptySpace() {
  useProjectState.setState((state) => {
    addSectionInEmptySpace({ type: UITypeNameSchema.enum.TERMINAL, state });
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

export function addChildrenToSeries(isRoot, calledBy, numChildren) {
  let newIds;
  useProjectState.setState((state) => {
    let parentId, startIdx;
    if (isRoot) {
      parentId = calledBy;
      startIdx = 0;
    } else {
      parentId = state.sections[calledBy].parentId;
      startIdx =
        state.variants[state.sections[parentId].variantId].children.indexOf(
          calledBy,
        ) + 1;
    }

    newIds = createSectionInfo({
      sectionProps: {
        parentId,
        size: { height: "auto", width: state.sections[parentId].size.width },
      },
      numSections: numChildren,
      state,
    });

    setSectionVariantChildren(
      parentId,
      (x) => insertIntoArray(x, startIdx, ...newIds),
      state,
    );
  });

  maybeIncrementProjectStateVersion(true);

  return newIds;
}

export function createSectionInfo({
  sectionProps = {},
  sectionVariantProps = {},
  numSections = 1,
  position,
  state,
}) {
  const newIds: string[] = [];
  const topLevelSectionIds: string[] = [];

  for (let i = 0; i < numSections; i++) {
    const s = createSection(sectionProps);
    const sConfig = createSectionConfig();
    s.variantIds = [sConfig.variantId];
    s.defaultVariantId = sConfig.variantId;
    newIds.push(s.id);
    state.sections[s.id] = s;
    getCurrentSectionConfigs(state)[s.id] = sConfig;
    state.variants[sConfig.variantId] =
      createSectionVariant(sectionVariantProps);
    switch (state.uiTypes[s.uiTypeId].type) {
      case UITypeNameSchema.enum.DRAW:
        addDrawAreaLayer(s.id, state);
        break;
      case UITypeNameSchema.enum.CHAT:
        addChatHistoryArtifact(s.id, state);
        break;
    }
    if (!s.parentId) {
      topLevelSectionIds.push(s.id);
    }
  }

  if (topLevelSectionIds.length > 0) {
    addNodes(
      topLevelSectionIds.map((s) => ({
        id: s,
        position,
        zIndex: 0,
        tempZIndex: 0,
      })),
    );
  }

  return newIds;
}
