import { dbSaveSectionJSONSource } from "requests/jsonSource";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { addTemporaryNotification } from "state/actions/notifications";
import { duplicateCodeInfoCol } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { createRandomName } from "utils/idNameCreation";
import { maybeRunGuiToYaml } from "./guiToYaml";
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

export async function createNewVersionMaybeWithJSON(sectionId, newVersionName) {
  const { name, isJsonSource } = getSectionVariant(sectionId);
  if (!newVersionName) {
    newVersionName = await createNewVersionName(name, isJsonSource);
  }
  let newVariantId;
  useSectionInfos.setState((state) => {
    ({ newVariantId } = createNewVersion(sectionId, newVersionName, state));
  });
  maybeRunGuiToYaml(sectionId, newVariantId);
  maybeSaveNewJSONVersion(newVariantId, isJsonSource);
}

/**
 * Set the values of multiple parameters in a particular section.
 * @SETTA_MCP_TOOL
 * @param {Object<ID, Array<str>>} sectionIdToVersionNames A dict mapping from section id to new version names.
 */
export async function createNewVersionsMcp({ sectionIdToVersionNames }) {
  for (const [sectionId, versionNames] of Object.entries(
    sectionIdToVersionNames,
  )) {
    for (const,)
    await createNewVersionMaybeWithJSON(sectionId, )
  }
}
