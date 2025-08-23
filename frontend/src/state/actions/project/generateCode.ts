import { getProjectData } from "./saveProject";

async function getProjectDataToGenerateCode({
  withArtifacts = false,
  includeDrawings = false,
  includeLatestChatMessages = false,
}) {
  const project = getProjectData({ withArtifacts });
  // if (includeDrawings || includeLatestChatMessages) {
  //   const sectionInfosState = useProjectState.getState().sections;
  //   const sections = {};
  //   for (const x of Object.values(sectionInfosState)) {
  //     const currSection = _.cloneDeep(x);
  //     if (includeDrawings && getSectionType(x.id) === UITypeNameEnum.DRAW) {
  //       currSection.drawing = await requestBase64FromCanvas(x.id);
  //     }
  //     if (includeLatestChatMessages && getSectionType(x.id) === UITypeNameEnum.CHAT) {
  //       // this property just needs to exist when the code is first imported
  //       currSection.latestChatMessage = null;
  //     }
  //     sections[x.id] = currSection;
  //   }
  //   project.sections = sections;
  // }
  return project;
}
