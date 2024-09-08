import _ from "lodash";
import { useArtifacts, useSectionInfos } from "state/definitions";
import { getProjectData } from "./saveProject";

// TODO make this more efficient
export function getProjectDataForInteractive() {
  const project = getProjectData();
  const sectionInfosState = useSectionInfos.getState().x;
  const artifactState = useArtifacts.getState().x;
  const sections = _.mapValues(sectionInfosState, (x) => {
    const currSection = _.omit(x, ["parentId"]);
    currSection.artifacts = currSection.artifacts.map((a) => artifactState[a]);
    return currSection;
  });
  project.sections = sections;
  return project;
}
