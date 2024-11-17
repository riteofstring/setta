import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { dbNewVersionFilename } from "requests/sectionVariants";
import { duplicateCodeInfoCol } from "state/actions/codeInfoCols";
import { setNotificationMessage } from "state/actions/notification";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import {
  duplicateSectionVariant,
  getSectionCodeInfoColId,
} from "state/actions/sectionVariants";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createRandomName } from "utils/idNameCreation";

export function CreateNewVersionButton({ sectionId }) {
  async function onClick() {
    const { variantId: currVariantId, jsonSource } = getSectionInfo(sectionId);
    const currCodeInfoColId = getSectionCodeInfoColId(sectionId);
    const newCodeInfoColId = duplicateCodeInfoCol(currCodeInfoColId);
    const newVariantId = duplicateSectionVariant({
      id: currVariantId,
      newName: await newVersionName(jsonSource),
      newCodeInfoColId,
    });
    setSectionInfoAttr({ sectionId, attr: "variantId", value: newVariantId });
    setSectionInfoAttr({
      sectionId,
      attr: "variantIds",
      newValueFn: (x) => [...x, newVariantId],
    });
    setNotificationMessage("New Version Created");
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}

async function newVersionName(jsonSource) {
  if (jsonSource) {
    const res = await dbNewVersionFilename(jsonSource);
    if (res.status == 200) {
      return res.data;
    }
  }
  return createRandomName();
}
