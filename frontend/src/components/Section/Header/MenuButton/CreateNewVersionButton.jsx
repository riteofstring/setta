import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setNotificationMessage } from "state/actions/notification";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { duplicateSectionVariant } from "state/actions/sectionVariants";
import { getSectionInfo } from "state/getters/sectionInfo";
import { createNewId, createRandomName } from "utils/idNameCreation";

export function CreateNewVersionButton({ sectionId }) {
  function onClick() {
    const currId = getSectionInfo(sectionId).variantId;
    const newName = createRandomName();
    const newId = createNewId();
    duplicateSectionVariant({ id: currId, newId, newName });
    setSectionInfoAttr({ sectionId, attr: "variantId", value: newId });
    setSectionInfoAttr({
      sectionId,
      attr: "variantIds",
      newValueFn: (x) => [...x, newId],
    });
    setNotificationMessage("New Version Created");
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
