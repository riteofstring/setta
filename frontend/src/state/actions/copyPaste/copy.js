import C from "constants/constants.json";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import {
  useActiveSection,
  useCodeInfo,
  useParamSweep,
  useSectionInfos,
} from "state/definitions";
import { getForSectionId } from "state/hooks/paramSweep";
import { findAll } from "utils/getDescendants";
import { getSectionInfo, getSectionType } from "../../getters/sectionInfo";
import { setNotificationMessage } from "../notification";
import { getSectionChildrenAcrossVariants } from "../sectionVariants";

export async function copy() {
  const activeSectionIds = useActiveSection.getState().ids;
  if (activeSectionIds.length > 0 && window.getSelection().toString() === "") {
    const data = copySections(activeSectionIds);
    console.log("copied data", data);
    await navigator.clipboard.writeText(
      JSON.stringify({
        data,
        copyType: "sections",
      }),
    );
  }
}

export function copySections(sectionIds) {
  const sections = getSections(sectionIds);
  const codeInfo = getCodeInfo(sections);
  const sectionVariants = getSectionVariants(sections);
  const uiTypeCols = getUITypeCols(sections);
  const uiTypes = getUITypes(sections, uiTypeCols);
  const paramSweeps = getParamSweeps(sections);
  const relativePositions = getRelativePositions(sections);
  return {
    sections,
    uiTypes,
    codeInfo,
    sectionVariants,
    uiTypeCols,
    paramSweeps,
    relativePositions,
  };
}

function getSections(sectionIds) {
  const output = new Set(...sectionIds);
  const ids = [...sectionIds];
  while (ids.length > 0) {
    const curr = ids.pop();
    if (curr in output) {
      continue;
    }
    const children = getSectionChildrenAcrossVariants(curr);
    for (const c of children) {
      ids.push(c);
    }
    output.add(curr);
  }
  const allSections = _.pick(useSectionInfos.getState().x, Array.from(output));

  const withoutLoneParamSweeps = _.pickBy(allSections, (s) => {
    if (getSectionType(s.id).type !== C.PARAM_SWEEP) {
      return true;
    }
    // if it's a param sweep section, then keep it only if it's corresponding section is also being copied.
    return getForSectionId(allSections, s.id);
  });

  if (_.size(allSections) !== _.size(withoutLoneParamSweeps)) {
    setNotificationMessage("Lone param sweeps won't be included in copy");
  }

  return withoutLoneParamSweeps;
}

function getUITypes(sections, uiTypeCols) {
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
  return _.pick(useSectionInfos.getState().uiTypes, uiTypeIds);
}

function getCodeInfo(sections) {
  const sectionCodeInfoIds = _.map(
    sections,
    (x) => getSectionInfo(x.id).codeInfoId,
  );
  let output = [];
  const codeInfoState = useCodeInfo.getState().x;
  for (const cid of sectionCodeInfoIds) {
    const codeInfos = findAll(codeInfoState, [cid]).ids.map(
      (x) => codeInfoState[x],
    );
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

function getSectionVariants(sections) {
  const output = {};
  const vState = useSectionInfos.getState().variants;
  for (const s of Object.values(sections)) {
    Object.assign(output, _.pick(vState, s.variantIds));
  }
  return output;
}

function getUITypeCols(sections) {
  return _.pick(
    useSectionInfos.getState().uiTypeCols,
    _.map(sections, (x) => x.uiTypeColId),
  );
}

function getParamSweeps(sections) {
  const output = {};
  const state = useParamSweep.getState().x;
  const sectionState = useSectionInfos.getState().x;
  for (const s of Object.values(sections)) {
    if (getSectionType(s.id).type === C.PARAM_SWEEP) {
      const forSectionId = getForSectionId(sectionState, s.id);
      const paramSweepIds = sectionState[forSectionId].paramSweepIds;
      Object.assign(output, _.pick(state, paramSweepIds));
    }
  }
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
