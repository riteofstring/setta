import { post } from "./utils";

export async function dbPasteSections(sectionsAndOtherInfo) {
  return await post({
    body: { sectionsAndOtherInfo },
    address: "/sections/makeCopy",
  });
}
