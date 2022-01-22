import {
  Box,
  Button,
  HStack,
  Input,
  List,
  ListItem,
  Popover,
  PopoverArrow,
  PopoverBody,
  PopoverContent,
  PopoverTrigger,
  VStack,
} from "@chakra-ui/react";
import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
import { useStoreActions, useStoreState } from "easy-peasy";
import { usePresetUIType } from "hooks/useUIType";
import React, { useState } from "react";
import useDeepCompareEffect from "use-deep-compare-effect";
import { PROJECT_DEFAULT } from "utils/constants";
import { checkboxChangeFn } from "utils/utils";

export default function UiConfigGlobal() {
  const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
  const overrideUITypeIds = useStoreActions(
    (x) => x.paramInfos.overrideUITypeIds
  );

  const setManyUITypeIds = useStoreActions(
    (x) => x.projectParamDefaults.setManyUITypeIds
  );

  const [params, setParams] = useState([]);

  function onCheckboxChange(newStateFn) {
    setParams(newStateFn);
  }

  // function onSetAsProjectDefault(overrideLevel = PROJECT_DEFAULT) {
  //   return () => {
  //     const uiType = getNewUIType({
  //       type: currSelected,
  //       config: savedConfig,
  //       origin: PROJECT_DEFAULT,
  //     });
  //     const toUITypeId = _.zipObject(
  //       params,
  //       _.fill(Array(params.length), { uiTypeId: uiType.id })
  //     );
  //     setUIType({ uiType });
  //     setManyUITypeIds({ toUITypeId });
  //     overrideUITypeIds({
  //       toUITypeId,
  //       overrideLevel,
  //     });
  //   };
  // }

  // function onOverrideExisting() {
  //   return onSetAsProjectDefault(SET_FROM_SIDEPANE);
  // }

  return (
    <HStack>
      <PresetConfig />
      <Box maxHeight="500px" overflowY="auto">
        <ParameterList onCheckboxChange={onCheckboxChange} />
      </Box>
      {/* <Button variant="outline" size="sm" onClick={onSetAsProjectDefault()}>
        Set as project default
      </Button>
      <Button variant="outline" size="sm" onClick={onOverrideExisting()}>
        Override existing
      </Button> */}
    </HStack>
  );
}

function PresetConfig() {
  const [selectedId, setSelectedId] = useState(null);
  const [uiType, setConfig] = usePresetUIType(selectedId);
  const defaultConfig = uiType ? uiType.config : {};
  const [localConfig, setLocalConfig] = useState(defaultConfig);

  useDeepCompareEffect(() => {
    setLocalConfig(defaultConfig);
  }, [defaultConfig]);

  function onDropdownSelect(e) {
    setSelectedId(e);
  }

  function onConfigChange(configName, newStateFn) {
    setLocalConfig((x) => ({ ...x, [configName]: newStateFn(x[configName]) }));
  }

  function onSave() {
    setConfig(localConfig);
  }

  return (
    <VStack>
      <UIConfigDropdownAndFields
        onDropdownSelect={onDropdownSelect}
        selectedId={uiType?.id}
        selectedType={uiType?.type}
        onConfigChange={onConfigChange}
        savedConfig={localConfig}
        origin={PROJECT_DEFAULT}
      />
      {uiType && <SaveButton presetName={uiType?.name} onSavePreset={onSave} />}
      {uiType && <SaveAsButton />}
    </VStack>
  );
}

function SaveButton({ presetName, onSavePreset }) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onSavePreset}
      isDisabled={!presetName}
    >
      Save
    </Button>
  );
}

function SaveAsButton() {
  const [presetName, setPresetName] = useState("");

  function onPresetNameChange(e) {
    setPresetName(e.target.value);
  }

  return (
    <Popover>
      <PopoverTrigger>
        <Button variant="outline" size="sm">
          Save As
        </Button>
      </PopoverTrigger>
      <PopoverContent>
        <PopoverArrow />
        <PopoverBody>
          <Input
            placeholder="Preset Name"
            value={presetName}
            onChange={onPresetNameChange}
          />
          <SaveButton presetName={presetName} />
        </PopoverBody>
      </PopoverContent>
    </Popover>
  );
}

function ParameterList(props) {
  const info = useStoreState((x) => x.master.allPackageInfo.children);
  return <InfoList info={info} {...props} />;
}

function InfoList({ info, m = 0, ...props }) {
  return (
    <List m={m}>
      {_.values(info).map((x, idx) => (
        <ListItem key={`${x.name}-${idx}`}>
          <>
            {x.children ? (
              <HigherItem x={x} m={m} {...props} />
            ) : (
              <ParameterItem x={x} {...props} />
            )}
          </>
        </ListItem>
      ))}
    </List>
  );
}

function HigherItem({ x, m, ...props }) {
  return (
    <>
      {x.name}
      <InfoList info={x.children} m={m + 5} {...props} />
    </>
  );
}

function _ParameterItem({ x, onCheckboxChange }) {
  function onChange(e) {
    onCheckboxChange(checkboxChangeFn(e, x.id));
  }
  return <ClickableDiv onClick={onChange}>{x.name}</ClickableDiv>;
}

const ParameterItem = React.memo(_ParameterItem, (p, n) => p.x.id === n.x.id);

function ClickableDiv({ onClick, children }) {
  const [isSelected, setIsSelected] = useState(false);

  function _onClick() {
    const newIsSelected = !isSelected;
    setIsSelected(newIsSelected);
    onClick({ target: { checked: newIsSelected } });
  }

  return (
    <div
      onClick={_onClick}
      style={{
        backgroundColor: isSelected ? "grey" : "white",
      }}
    >
      {children}
    </div>
  );
}
