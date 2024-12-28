import { dbSaveSectionJSONSource } from "requests/jsonSource";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { setNotificationMessage } from "state/actions/notification";
import {
  duplicateCodeInfoCol,
  getSectionInfo,
} from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { duplicateSectionVariant, getSectionVariant } from "./sectionInfos";

export function createNewVersion(sectionId, newVersionName, state) {
  const { variantId: currVariantId } = state.x[sectionId];
  const currCodeInfoColId = getSectionVariant(sectionId, state).codeInfoColId;
  const newCodeInfoColId = currCodeInfoColId
    ? duplicateCodeInfoCol(currCodeInfoColId, state)
    : null;
  const newVariantId = duplicateSectionVariant(
    currVariantId,
    newVersionName,
    newCodeInfoColId,
    state,
  );
  state.x[sectionId].variantId = newVariantId;
  state.x[sectionId].variantIds.push(newVariantId);
  return { newVariantId, oldVariantId: currVariantId };
}

export async function maybeSaveNewJSONVersion(
  sectionId,
  jsonSource,
  oldVariantId,
) {
  if (jsonSource) {
    const { name: oldVariantName } =
      useSectionInfos.getState().variants[oldVariantId];
    await dbSaveSectionJSONSource(sectionId, oldVariantName);
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

export async function createNewVersionMaybeWithJSON(sectionId) {
  const { jsonSource } = getSectionInfo(sectionId);
  const newVersionName = await createNewVersionName(jsonSource);
  let oldVariantId;
  useSectionInfos.setState((state) => {
    ({ oldVariantId } = createNewVersion(sectionId, newVersionName, state));
  });
  maybeSaveNewJSONVersion(sectionId, jsonSource, oldVariantId);
}
