import C from "constants/constants.json";
import _ from "lodash";
import { getSectionType } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { requestBase64FromCanvas } from "../temporaryMiscState";
import { getProjectData } from "./saveProject";

export async function getProjectDataToGenerateCode({
  withArtifacts = false,
  includeDrawings = false,
  includeLatestChatMessages = false,
}) {
  const project = getProjectData({ withArtifacts });
  if (includeDrawings || includeLatestChatMessages) {
    const sectionInfosState = useSectionInfos.getState().x;
    const sections = {};
    for (const x of Object.values(sectionInfosState)) {
      const currSection = _.cloneDeep(x);
      if (includeDrawings && getSectionType(x.id) === C.DRAW) {
        currSection.drawing = await requestBase64FromCanvas(x.id);
      }
      if (includeLatestChatMessages && getSectionType(x.id) === C.CHAT) {
        // this property just needs to exist when the code is first imported
        currSection.latestChatMessage = null;
      }
      sections[x.id] = currSection;
    }
    project.sections = sections;
  }

  return project;
}
