import C from "constants/constants.json";
import _ from "lodash";
import {
  useActiveSection,
  useCodeInfo,
  useNodeInternals,
  useSectionInfos,
  useSectionVariants,
  useUITypeCols,
  useUITypes,
} from "state/definitions";
import { DB_SOURCE_MAPPING } from "utils/constants";
import { findAll } from "utils/getDescendants";
import {
  getMappedSectionDBSource,
  getSectionInfo,
} from "../../getters/sectionInfo";
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
  const relativePositions = getRelativePositions(sections);
  return {
    sections,
    uiTypes,
    codeInfo,
    sectionVariants,
    uiTypeCols,
    relativePositions,
    dbSourceMapping: DB_SOURCE_MAPPING,
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
  return _.pick(useSectionInfos.getState().x, Array.from(output));
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
  return _.pick(useUITypes.getState().x, uiTypeIds);
}

function getCodeInfo(sections) {
  const sectionCodeInfoIds = _.map(
    sections,
    (x) => getSectionInfo(x.id).codeInfoId,
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

function getSectionVariants(sections) {
  const output = {};
  const vState = useSectionVariants.getState().x;
  for (const s of Object.values(sections)) {
    const dbSource = getMappedSectionDBSource(s.id);
    if (!(dbSource in output)) {
      output[dbSource] = {};
    }
    Object.assign(output[dbSource], _.pick(vState[dbSource], s.variantIds));
  }
  return output;
}

function getUITypeCols(sections) {
  return _.pick(
    useUITypeCols.getState().y,
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
