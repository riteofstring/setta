import C from "constants/constants.json";
import { dbUpdateInteractiveCode } from "requests/interactive";
import {
  useActiveSection,
  useInteractive,
  useSectionInfos,
} from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";

export function setInteractiveProjects(payload) {
  useInteractive.setState({ projects: new Set(payload) });
}

export function setCurrProjectIsInteractive(projectName) {
  useInteractive.setState((state) => ({
    currProjectIsInteractive: state.projects.has(projectName),
  }));
}

export function setInteractiveData(payload) {
  useInteractive.setState({ data: payload });
}

export async function updateInteractiveCode() {
  const ids = useActiveSection.getState().ids;
  const codeDict = {};
  for (const id of ids) {
    if (getSectionType(id).type === C.INTERACTIVE_CODE) {
      codeDict[id] = useSectionInfos.getState().x[id].code;
    }
  }
  const res = await dbUpdateInteractiveCode(codeDict);
  console.log(res.data);
}
