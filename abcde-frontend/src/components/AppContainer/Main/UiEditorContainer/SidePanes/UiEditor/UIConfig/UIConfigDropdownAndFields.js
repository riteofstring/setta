import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { PrettyDropDown } from "utils/PrettyDropdown/prettyDropdown";
import { prettyToUITypes, uiTypesToPretty } from "utils/constants";

export function UIConfigDropdownAndFields({
  onDropdownSelect,
  currSelected,
  onConfigChange,
  paramInfoId,
  savedConfig,
  childIdFn,
}) {
  function onSelect(e) {
    onDropdownSelect(prettyToUITypes.get(e.target.value));
  }

  return (
    <VStack>
      <PrettyDropDown
        placeholder="Select UI Type"
        onChange={onSelect}
        prettyToX={prettyToUITypes}
        xToPretty={uiTypesToPretty}
        currX={currSelected}
      />
      <ParamUIConfig
        name={currSelected}
        paramInfoId={paramInfoId}
        childIdFn={childIdFn}
        savedConfig={savedConfig}
        onChange={onConfigChange}
      />
    </VStack>
  );
}
