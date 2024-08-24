import C from "constants/constants.json";
import { dbUpdateInteractiveCode } from "requests/interactive";
import { useInteractive, useSectionInfos } from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { setNotificationMessage } from "./notification";

export async function updateInteractiveCode() {
  // const ids = useActiveSection.getState().ids;
  // const codeDict = {};
  // for (const id of ids) {
  //   if (getSectionType(id).type === C.INTERACTIVE_CODE) {
  //     codeDict[id] = useSectionInfos.getState().x[id].code;
  //   }
  // }

  const codeDict = {};
  for (const [id, s] of Object.entries(useSectionInfos.getState().x))
    if (getSectionType(id).type === C.INTERACTIVE_CODE) {
      codeDict[id] = s.code;
    }
  setNotificationMessage("Importing your code...");
  const res = await dbUpdateInteractiveCode(codeDict);
  setNotificationMessage("Done importing");
  if (res.status == 200) {
    useInteractive.setState({ taskNames: res.data.taskNames });
  }
}
