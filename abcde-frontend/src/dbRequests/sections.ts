import { NO_AUTH } from "utils/constants";
import { noAuthGetSections, noAuthLoadSection } from "./noAuth/sections";

export async function dbGetSections() {
  if (NO_AUTH) {
    return await noAuthGetSections();
  }

  // return await post({
  //   body: {},
  //   address: SECTIONS,
  //   withCredentials: true,
  // });
}

export async function dbLoadSection({ sectionId }) {
  if (NO_AUTH) {
    return await noAuthLoadSection({ sectionId });
  }
}
