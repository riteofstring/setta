import { updateManyParamsAndCallables } from "state/actions/sections/sectionContents";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { initializeChildParams } from "../initializeParam";
import { setSectionUITypeConfig } from "./setSectionUITypeConfig";

export function setCollections({
  sectionId,
  settingPreset = false,
  id,
  checked,
  newValueFn,
  incrementVersion,
}) {
  const sectionIds = [sectionId];

  if (checked) {
    initializeChildParams({ sectionIds, codeInfoIds: [id] });
  }

  setSectionUITypeConfig({
    sectionId,
    configProps: { configName: "collections", newValueFn },
  });
  updateManyParamsAndCallables(sectionIds);
  maybeIncrementProjectStateVersion(incrementVersion);
}
