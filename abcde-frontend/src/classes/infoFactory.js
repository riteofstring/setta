import { SectionInfo } from "./jsonParser";

const { createNewId } = require("../utils/sectionIds");

export function createSectionInfo(name, specs, available) {
  const newInfo = new SectionInfo(name, specs, available);
  const newInfoId = createNewId();
  return [newInfo, newInfoId];
}
