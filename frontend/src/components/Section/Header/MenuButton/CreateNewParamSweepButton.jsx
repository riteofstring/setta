import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { setNotificationMessage } from "state/actions/notification";
import { setSectionInfoAttr } from "state/actions/sections/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { getSectionInfo } from "state/getters/sectionInfo";
import { duplicateParamSweep, getForSectionId } from "state/hooks/paramSweep";
import { createRandomName } from "utils/idNameCreation";

export function CreateNewParamSweepButton({ sectionId }) {
  function onClick() {
    const forSectionId = getForSectionId(
      useSectionInfos.getState().x,
      sectionId,
    );
    const currParamSweepId = getSectionInfo(forSectionId).paramSweepId;

    const name = createRandomName();
    const newParamSweepId = duplicateParamSweep({
      id: currParamSweepId,
      newName: name,
    });

    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepId",
      value: newParamSweepId,
    });
    setSectionInfoAttr({
      sectionId: forSectionId,
      attr: "paramSweepIds",
      newValueFn: (x) => [...x, newParamSweepId],
    });
    setNotificationMessage("New Param Sweep Created");
  }

  return <MenuItem onClick={onClick}>New Version</MenuItem>;
}
