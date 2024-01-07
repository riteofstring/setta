import _ from "lodash";
import { useActiveSection } from "models/activeSection";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { REACT_FLOW_STORE } from "utils/constants";
import { findAll } from "z_utils/getDescendants";
import { getSectionTypeConfig } from "./sections/getters";

export async function copySections() {
  const activeSectionIds = useActiveSection.getState().ids;
  if (activeSectionIds.length < 1) {
    return;
  }
  const sections = _.pick(useSectionInfos.getState().x, activeSectionIds);
  const uiTypes = getUITypes(sections);
  const codeInfo = getCodeInfo(sections);
  const evCols = getEVCols(sections);
  const uiTypeCols = getUITypeCols(sections);
  const relativePositions = getRelativePositions(sections);
  await navigator.clipboard.writeText(
    JSON.stringify({
      data: {
        sections,
        uiTypes,
        codeInfo,
        evCols,
        uiTypeCols,
        relativePositions,
      },
      copyType: "sections",
    })
  );
}

function getUITypes(sections) {
  const uiTypeIds = [];
  for (const s of Object.values(sections)) {
    uiTypeIds.push(s.uiTypeId);
    uiTypeIds.push(...s.nonPresetUITypeIds);
  }
  return _.pick(useUITypes.getState().x, uiTypeIds);
}

function getCodeInfo(sections) {
  const codeInfoIds = _.map(
    sections,
    (x) => getSectionTypeConfig(x.id).codeInfoId
  );
  return _.keyBy(findAll(useCodeInfo.getState().x, codeInfoIds), (x) => x.id);
}

function getEVCols(sections) {
  const evColIds = [];
  for (const s of Object.values(sections)) {
    evColIds.push(s.evColId);
    evColIds.push(...s.evColIds);
  }
  return _.pick(useParamInfos.getState().x, evColIds);
}

function getUITypeCols(sections) {
  return _.pick(
    useParamInfos.getState().y,
    _.map(sections, (x) => x.uiTypeColId)
  );
}

function getRelativePositions(sections) {
  const positions = {};
  const nodeInternals = REACT_FLOW_STORE.store.getState().nodeInternals;
  for (const s of Object.values(sections)) {
    positions[s.id] = nodeInternals.get(s.id).position;
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
