import C from "constants/constants.json";
import { addCodeInfo } from "state/actions/codeInfo";
import { updateParamsAndCallables } from "state/actions/sectionContents";
import { setSectionUITypeConfig } from "state/actions/setSectionUITypeConfig";
import { setSectionUITypeId } from "state/actions/setSectionUITypeId";
import { maybeIncrementProjectStateVersion } from "state/actions/undo";
import { getSectionTypeConfig } from "state/getters/sectionInfo";
import { useGetSectionInfo } from "state/hooks/useGetSectionInfo";
import { SectionUITypeCombobox } from "utils/Combobox/UITypeCombobox";
import { newCodeInfo } from "utils/objs/codeInfo";

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
        addCodeInfo({ info: codeInfo });
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
