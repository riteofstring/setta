import { NO_AUTH } from "utils/constants";
import { noAuthGetSections } from "./noAuth/sections";

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
