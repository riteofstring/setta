import C from "constants/constants.json";
import { useCodeInfo } from "state/definitions/codeInfo";
import { updateParamsAndCallables } from "state/actions/sectionContents";
import { getSectionTypeConfig } from "state/getters/sectionInfo";
import { useGetSectionInfo } from "state/sectionInfos/hooks/useGetSectionInfo";
import { setSectionUITypeConfig } from "thunks/uiTypes/setSectionUITypeConfig";
import { setSectionUITypeId } from "thunks/uiTypes/setSectionUITypeId";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { SectionUITypeCombobox } from "utils/Combobox/UITypeCombobox";
import { newCodeInfo } from "z_utils/objs/codeInfo";

export function SectionConfigTypeSelection({ sectionId }) {
  const selectedId = useGetSectionInfo(sectionId, "uiTypeId");

  const onDropdownSelect = (e) => {
    //TODO fix this horrible shit
    if (e && e !== selectedId) {
      setSectionUITypeId({ uiTypeId: e, sectionId, incrementVersion: false });
      if (!getSectionTypeConfig(sectionId).codeInfoId) {
        const codeInfo = newCodeInfo({
          name: "Section Contents",
          rcType: C.COLLECTION,
        });
        useCodeInfo.getState().addCodeInfo({ info: codeInfo });
        setSectionUITypeConfig({
          sectionId,
          configProps: {
            configName: "codeInfoId",
            newValueFn: () => codeInfo.id,
          },
        });
        updateParamsAndCallables(sectionId);

        maybeIncrementProjectStateVersion(true);
      }
    }
  };

  return (
    <SectionUITypeCombobox
      sectionId={sectionId}
      onDropdownSelect={onDropdownSelect}
      selectedId={selectedId}
    />
  );
}
