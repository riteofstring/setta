import { SECTIONS } from "z_utils/routes";
import { post } from "./utils";

export async function dbGetSections() {
  return await post({
    body: {},
    address: SECTIONS,
  });
}

export async function dbLoadSection({ sectionId }) {
  return await post({
    body: { sectionId },
    address: SECTIONS,
  });
}
