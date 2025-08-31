import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import { useProjectState } from "state/definitions";
import { route_prepare_sections_for_copy } from "utils/generatedEndpoints";
import { findAll } from "utils/getDescendants";
import { addTemporaryNotification } from "../notifications";
import { getCurrProjectConfigId } from "../sectionInfos";

export async function copy() {
  const activeSectionIds = useProjectState.getState().projectConfig.activeIds;
  if (activeSectionIds.length > 0 && window.getSelection()?.toString() === "") {
    addTemporaryNotification("Copying...");
    const data = await route_prepare_sections_for_copy({
      projectConfigId: getCurrProjectConfigId(),
      sectionIds: activeSectionIds,
    });
    await navigator.clipboard.writeText(
      JSON.stringify({
        data,
        copyType: "sections",
      }),
    );
    addTemporaryNotification("Copied to clipboard");
  }
}

export function copySections(sectionIds) {
  const state = useProjectState.getState();
  const sections = getSections(sectionIds, state);
  const variants = getSectionVariants(sections, state);
  const uiTypeCols = getUITypeCols(sections, state);
  const uiTypes = getUITypes(sections, uiTypeCols, state);
  const codeInfoCols = getCodeInfoCols(variants, state);
  const codeInfo = getCodeInfo(codeInfoCols, state);
  const relativePositions = getRelativePositions(sections);
  return {
    sections,
    variants,
    uiTypeCols,
    uiTypes,
    codeInfoCols,
    codeInfo,
    relativePositions,
  };
}

function getSections(sectionIds, state) {
  // const ids = getAllSectionsForDeletionOrCopying(sectionIds, state);
  return _.pick(state.sections, ids);
}

function getSectionVariants(sections, state) {
  const output = {};
  for (const s of Object.values(sections)) {
    Object.assign(output, _.pick(state.variants, s.variantIds));
  }
  return output;
}

function getUITypeCols(sections, state) {
  return _.pick(
    state.uiTypeCols,
    _.map(sections, (x) => x.uiTypeColId),
  );
}

function getUITypes(sections, uiTypeCols, state) {
  const uiTypeIds = [];
  for (const s of Object.values(sections)) {
    uiTypeIds.push(s.uiTypeId);
    uiTypeIds.push(...s.nonPresetUITypeIds);
  }
  for (const col of Object.values(uiTypeCols)) {
    for (const u of Object.values(col)) {
      uiTypeIds.push(u.uiTypeId);
      uiTypeIds.push(...u.nonPresetUITypeIds);
    }
  }
  return _.pick(state.uiTypes, uiTypeIds);
}

function getCodeInfoCols(variants, state) {
  return _.pick(
    state.codeInfoCols,
    _.map(variants, (x) => x.codeInfoColId),
  );
}

function getCodeInfo(codeInfoCols, state) {
  let output = [];
  for (const codeInfoCol of Object.values(codeInfoCols)) {
    const { ids } = findAll(state.codeInfo, codeInfoCol.children);

    for (const id of ids) {
      output.push(state.codeInfo[id]);
    }
  }
  output = _.keyBy(_.cloneDeep(output), (x) => x.id);

  return output;
}

function getRelativePositions(sections) {
  const positions = {};
  for (const k of Object.keys(sections)) {
    const rect = getSectionRect(k);
    if (rect) {
      positions[k] = { x: rect.x, y: rect.y, zIndex: 0 };
    }
  }

  let minX = Infinity;
  let minY = Infinity;
  for (const p of Object.values(positions)) {
    if (p.x < minX) {
      minX = p.x;
    }
    if (p.y < minY) {
      minY = p.y;
    }
  }

  return _.mapValues(positions, (v) => ({
    x: v.x - minX,
    y: v.y - minY,
    zIndex: v.zIndex,
  }));
}
