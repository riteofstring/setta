import { SECTIONS } from "abcde-utils/src/routes";
import { post } from "./utils";

export async function dbGetSections() {
  return await post({
    body: {},
    address: SECTIONS,
    withCredentials: true,
  });
}

export async function dbLoadSection({ sectionId }) {
  return await post({
    body: { sectionId },
    address: SECTIONS,
    withCredentials: true,
  });
}
