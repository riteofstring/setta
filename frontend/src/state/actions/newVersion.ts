import { addTemporaryNotification } from "state/actions/notifications";
import { useProjectState } from "state/definitions";
import { res200 } from "utils/endpointUtils";
import {
  route_new_json_version_name,
  route_save_section_json_source,
} from "utils/generatedEndpoints";
import { createRandomName } from "utils/idNameCreation";
import { maybeRunGuiToYaml } from "./guiToYaml";
import { getSectionVariant } from "./sectionInfos";

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
    ({ newVariantId } = createNewSectionVersion(
      sectionId,
      newVersionName,
      state,
    ));
  });
  maybeRunGuiToYaml(sectionId, newVariantId);
  maybeSaveNewJSONVersion(newVariantId, isJsonSource);
}
