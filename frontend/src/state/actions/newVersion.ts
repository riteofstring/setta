import { dbSaveSectionJSONSource } from "requests/jsonSource";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { addTemporaryNotification } from "state/actions/notifications";
import { duplicateCodeInfoCol } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { maybeRunGuiToYaml } from "./guiToYaml";
import { duplicateSectionVariant, getSectionVariant } from "./sectionInfos";

export function createNewVersion(sectionId, newVersionName, state) {
  const { variantId: currVariantId } = state.sections[sectionId];
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
  state.sections[sectionId].variantId = newVariantId;
  state.sections[sectionId].variantIds.push(newVariantId);
  return { newVariantId, oldVariantId: currVariantId };
}

async function maybeSaveNewJSONVersion(newVariantId, isJsonSource) {
  if (isJsonSource) {
    await dbSaveSectionJSONSource(newVariantId);
  }
  addTemporaryNotification("New Version Created");
}

async function createNewVersionName(currName, isJsonSource) {
  if (isJsonSource) {
    const res = await dbNewVersionFilename(currName);
    if (res.status === 200) {
      return res.data;
    }
  }
  return createRandomName();
}

export async function createNewVersionMaybeWithJSON(sectionId) {
  const { name, isJsonSource } = getSectionVariant(sectionId);
  const newVersionName = await createNewVersionName(name, isJsonSource);
  let newVariantId;
  useProjectState.setState((state) => {
    ({ newVariantId } = createNewVersion(sectionId, newVersionName, state));
  });
  maybeRunGuiToYaml(sectionId, newVariantId);
  maybeSaveNewJSONVersion(newVariantId, isJsonSource);
}
