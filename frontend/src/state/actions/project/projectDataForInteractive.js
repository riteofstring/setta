import C from "constants/constants.json";
import _ from "lodash";
import { getSectionType } from "state/actions/sectionInfo";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { requestBase64FromDrawArea } from "../temporaryMiscState";
import { getProjectData } from "./saveProject";

export async function getProjectDataForInteractive() {
  const project = getProjectData({});
  const sectionInfosState = useSectionInfos.getState().x;
  const artifactState = useArtifacts.getState().x;
  const sections = {};
  for (const x of Object.values(sectionInfosState)) {
    const currSection = _.omit(x, ["parentId"]);
    currSection.artifacts = currSection.artifacts.map((a) => artifactState[a]);
    if (getSectionType(x.id).type === C.DRAW) {
      currSection.drawings = await requestBase64FromDrawArea(x.id);
    }
    sections[x.id] = currSection;
  }
  project.sections = sections;
  return project;
}
