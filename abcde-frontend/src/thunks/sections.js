import { thunk } from "easy-peasy";

function getSectionConfigId(s, sectionId) {
  console.log("sectionId", sectionId);
  console.log("s.sectionInfos.x[sectionId]", s.sectionInfos.x[sectionId]);
  return s.sectionInfos.x[sectionId]?.configId;
}

export function getSectionType(s, sectionId) {
  const configId = getSectionConfigId(s, sectionId);
  const sectionTypeId = s.sectionConfigs.x[configId].uiTypeId;
  return s.uiTypes.x[sectionTypeId];
}

export function getSectionConfig(s, sectionId) {
  return getSectionType(s, sectionId).config;
}

export const setSectionConfigAttr = thunk((action, payload, helpers) => {
  const { sectionId, attr, value } = payload;
  const s = helpers.getStoreState();
  const a = helpers.getStoreActions();

  const configId = getSectionConfigId(s, sectionId);
  a.sectionConfigs.setSectionConfigAttr({ configId, attr, value });
});
