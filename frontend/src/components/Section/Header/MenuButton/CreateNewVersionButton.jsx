import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { dbSaveSectionJSONSource } from "requests/jsonSource";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { duplicateCodeInfoCol } from "state/actions/codeInfoCols";
import { setNotificationMessage } from "state/actions/notification";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import {
  duplicateSectionVariant,
  getSectionCodeInfoColId,
} from "state/actions/sectionVariants";
import { useSectionInfos } from "state/definitions";
import { getSectionConfig, getSectionInfo } from "state/getters/sectionInfo";
import { createRandomName } from "utils/idNameCreation";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    const { jsonSource } = getSectionInfo(sectionId);
    const { variantId: currVariantId } = getSectionConfig(sectionId);
    const currCodeInfoColId = getSectionCodeInfoColId(sectionId);
    const newCodeInfoColId = duplicateCodeInfoCol(currCodeInfoColId);
    const newVariantId = duplicateSectionVariant({
      id: currVariantId,
      newName: await newVersionName(jsonSource),
      newCodeInfoColId,
    });
    useSectionInfos((x) => {
      x.sectionConfigs[sectionId].variantId = newVariantId;
    });
    setSectionInfoAttr({
      sectionId,
      attr: "variantIds",
      newValueFn: (x) => [...x, newVariantId],
    });
    if (jsonSource) {
      await dbSaveSectionJSONSource(sectionId);
    }

    setNotificationMessage("New Version Created");
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}

async function newVersionName(jsonSource) {
  if (jsonSource) {
    const res = await dbNewVersionFilename(jsonSource);
    if (res.status === 200) {
      return res.data;
    }
  }
  return createRandomName();
}
