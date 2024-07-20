import C from "constants/constants.json";
import _ from "lodash";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useNodeInternals } from "state/definitions/nodeInternals";
import { useParamInfos } from "state/definitions/paramInfos";
import { useUITypes } from "state/definitions/uiTypes";
import { useSectionInfos } from "state/definitions/sectionInfos";
import { findAll } from "z_utils/getDescendants";
import { getSectionTypeConfig } from "../getters/sectionInfo";

export function copySections(sectionIds) {
  const sections = _.pick(useSectionInfos.getState().x, sectionIds);
  const uiTypes = getUITypes(sections);
  const codeInfo = getCodeInfo(sections);
  const evCols = getEVCols(sections);
  const uiTypeCols = getUITypeCols(sections);
  const relativePositions = getRelativePositions(sections);
  return {
    sections,
    uiTypes,
    codeInfo,
    evCols,
    uiTypeCols,
    relativePositions,
  };
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
  const sectionCodeInfoIds = _.map(
    sections,
    (x) => getSectionTypeConfig(x.id).codeInfoId,
  );
  let output = [];
  for (const cid of sectionCodeInfoIds) {
    const codeInfos = findAll(useCodeInfo.getState().x, [cid]);
    if (codeInfos.some((x) => x.isSelected)) {
      output.push(
        ...codeInfos.filter(
          (x) =>
            x.isSelected ||
            x.rcType === C.CALLABLE ||
            x.rcType === C.COLLECTION ||
            sectionCodeInfoIds.includes(x.id),
        ),
      );
    } else {
      output.push(...codeInfos);
    }
  }
  output = _.keyBy(_.cloneDeep(output), (x) => x.id);

  for (const c of Object.values(output)) {
    c.children = c.children.filter((x) => x in output);
  }

  return output;
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
    _.map(sections, (x) => x.uiTypeColId),
  );
}

function getRelativePositions(sections) {
  const positions = _.pick(
    Object.fromEntries(useNodeInternals.getState().x),
    _.map(sections, (x) => x.id),
  );

  let minX = Infinity;
  let minY = Infinity;
  for (const p of Object.values(positions)) {
    if (p.position.x < minX) {
      minX = p.position.x;
    }
    if (p.position.y < minY) {
      minY = p.position.y;
    }
  }

  return _.mapValues(positions, (v) => ({
    x: v.position.x - minX,
    y: v.position.y - minY,
    zIndex: v.zIndex,
  }));
}
