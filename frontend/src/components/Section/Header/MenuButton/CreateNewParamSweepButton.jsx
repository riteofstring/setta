import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setNotificationMessage } from "state/actions/notification";
import { initParamSweep } from "state/actions/runGroups/paramSweep";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { getForSectionId } from "state/hooks/paramSweep";
import { createNewId, createRandomName } from "utils/idNameCreation";

export function CreateNewParamSweepButton({ sectionId }) {
  function onClick() {
    const newId = createNewId();
    const name = createRandomName();
    initParamSweep({ id: newId, name });
    const forSectionId = getForSectionId(
      useSectionInfos.getState().x,
      sectionId,
    );
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepId",
      value: newId,
    });
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepIds",
      newValueFn: (x) => [...x, newId],
    });
    setNotificationMessage("New Version Created");
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
