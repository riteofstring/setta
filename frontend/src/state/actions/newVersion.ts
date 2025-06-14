import { addTemporaryNotification } from "state/actions/notifications";
import { duplicateCodeInfoCol } from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_new_json_version_name,
  route_save_section_json_source,
} from "utils/generatedEndpoints";
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

async function maybeSaveNewJSONVersion(
  newVariantId: string,
  isJsonSource: boolean,
) {
  if (isJsonSource) {
    const { sections, codeInfoCols, variants, codeInfo } =
      useProjectState.getState();
    await route_save_section_json_source({
      project: { sections, codeInfoCols, variants, codeInfo },
      variantId: newVariantId,
    });
  }
  addTemporaryNotification("New Version Created");
}

async function createNewVersionName(currName, isJsonSource) {
  if (isJsonSource) {
    const res = await route_new_json_version_name({ filename: currName });
    if (res200(res)) {
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
