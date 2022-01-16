import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useStoreState } from "easy-peasy";
import { StandardDropDown } from "utils/StandardDropdown/StandardDropdown";
import { uiTypesToPretty } from "utils/constants";

export function UIConfigDropdownAndFields({
  onDropdownSelect,
  selectedId,
  selectedType,
  onConfigChange,
  paramInfoId,
  savedConfig,
  childIdFn,
  origin,
}) {
  function createName(uiType) {
    const x = uiTypesToPretty.get(uiType.type);
    if (uiType.name) {
      return `${uiType.name} (${x})`;
    }
    return x;
  }

  const availableUITypes = useStoreState(
    (x) => _.mapValues(x.uiTypes.x, (v) => createName(v)),
    _.isEqual
  );

  function onSelect(e) {
    onDropdownSelect(e.target.value);
  }

  return (
    <VStack>
      <StandardDropDown
        placeholder="Select UI Type"
        onChange={onSelect}
        options={availableUITypes}
        curr={selectedId}
      />
      <ParamUIConfig
        name={selectedType}
        paramInfoId={paramInfoId}
        childIdFn={childIdFn}
        savedConfig={savedConfig}
        onChange={onConfigChange}
        origin={origin}
      />
    </VStack>
  );
}
