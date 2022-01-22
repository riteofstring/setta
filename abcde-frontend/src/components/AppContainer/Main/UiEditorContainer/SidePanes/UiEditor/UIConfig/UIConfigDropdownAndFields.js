import { VStack } from "@chakra-ui/react";
import { ParamUIConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ParamUI";
import { useStoreState } from "easy-peasy";
import _ from "lodash";
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
      return `${uiType.name} - (${x})`;
    }
    return x;
  }

  function presetsOnly(x) {
    return _.pickBy(x, (v) => v.isPreset || v.id === selectedId);
  }

  const availableUITypes = useStoreState(
    (x) => _.mapValues(presetsOnly(x.uiTypes.x), (v) => createName(v)),
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
