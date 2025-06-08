import { RouteEnum } from "utils/generatedTypes";
import { post } from "./utils";

export async function dbCreateCopyOfSections(sectionsAndOtherInfo) {
  return await post({
    body: { sectionsAndOtherInfo },
    address: RouteEnum.COPY_SECTIONS,
  });
}
