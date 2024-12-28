import C from "constants/constants.json";
import _ from "lodash";
import { getSectionType } from "state/actions/sectionInfos";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { requestBase64FromCanvas } from "../temporaryMiscState";
import { getProjectData } from "./saveProject";

export async function getProjectDataForInteractive() {
  const project = getProjectData({});
  // const sectionInfosState = useSectionInfos.getState().x;
  // const artifactState = useArtifacts.getState();
  // const sections = {};
  // for (const x of Object.values(sectionInfosState)) {
  //   const currSection = _.omit(x, ["parentId"]);
  //   currSection.artifacts = currSection.artifactIds.map(
  //     (a) => artifactState[a],
  //   );
  //   if (getSectionType(x.id) === C.DRAW) {
  //     currSection.drawings = await requestBase64FromCanvas(x.id);
  //   }
  //   sections[x.id] = currSection;
  // }
  // project.sections = sections;
  return project;
}
