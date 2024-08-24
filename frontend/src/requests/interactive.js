import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { getSectionType } from "state/getters/sectionInfo";
import { post } from "./utils";

export async function dbUpdateInteractiveCode() {
  for (const [id, s] of Object.entries(useSectionInfos.getState().x)) {
    if (getSectionType(id).type === C.INTERACTIVE_CODE) {
      const code = s.code;
      return await post({
        body: { code },
        address: C.ROUTE_UPDATE_INTERACTIVE_CODE,
      });
    }
  }
}
