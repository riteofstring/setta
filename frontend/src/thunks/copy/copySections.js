import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useProjectConfig } from "models/info/projectConfig";
import { useSectionInfos } from "models/info/sectionInfos";
import { useUITypes } from "models/info/uiTypes";
import { findAll } from "z_utils/getDescendants";
import { RCType } from "z_utils/types/codeInfo";
import { getSectionTypeConfig } from "../sections/getters";
import { useNodeInternals } from "models/info/nodeInternals";

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
            x.rcType === RCType.CALLABLE ||
            x.rcType === RCType.COLLECTION ||
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
