import { dbSaveSectionJSONSource } from "requests/jsonSource";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { duplicateCodeInfoCol } from "state/actions/codeInfoCols";
import { setNotificationMessage } from "state/actions/notification";
import { createRandomName } from "utils/idNameCreation";
import { duplicateSectionVariant } from "./sectionInfos";

export function createNewVersion(sectionId, newVersionName, state) {
  const { variantId: currVariantId } = state.x[sectionId];
  const currCodeInfoColId =
    state.variants[state.x[sectionId].variantId].codeInfoColId;
  const newCodeInfoColId = duplicateCodeInfoCol(currCodeInfoColId, state);
  const newVariantId = duplicateSectionVariant(
    currVariantId,
    newVersionName,
    newCodeInfoColId,
    state,
  );
  state.x[sectionId].variantId = newVariantId;
  state.x[sectionId].variantIds.push(newVariantId);
  return newVariantId;
}

export async function maybeSaveNewJSONVersion(sectionId, jsonSource) {
  if (jsonSource) {
    await dbSaveSectionJSONSource(sectionId);
  }
  setNotificationMessage("New Version Created");
}

export async function createNewVersionName(jsonSource) {
  if (jsonSource) {
    const res = await dbNewVersionFilename(jsonSource);
    if (res.status === 200) {
      return res.data;
    }
  }
  return createRandomName();
}
