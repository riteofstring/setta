// import {
//   Box,
//   Button,
//   HStack,
//   Input,
//   List,
//   ListItem,
//   Popover,
//   PopoverArrow,
//   PopoverBody,
//   PopoverContent,
//   PopoverTrigger,
//   VStack,
// } from "@chakra-ui/react";
// import { UIConfigDropdownAndFields } from "components/AppContainer/Main/UiEditorContainer/SidePanes/UiEditor/UIConfig/UIConfigDropdownAndFields";
// import { useStoreActions, useStoreState } from "easy-peasy";
// import { usePresetUIType } from "hooks/usePresetUIType";
// import React, { useState } from "react";
// import useDeepCompareEffect from "use-deep-compare-effect";
// import { PROJECT_DEFAULT, SET_FROM_SIDEPANE } from "utils/constants";
// import { USER } from "utils/uiTypeConstants";
// import { cloneNewUIType, createOriginInfoId } from "utils/uiTypeUtils";
// import { checkboxChangeFn } from "utils/utils";

// export default function UiConfigGlobal() {
//   const [selectedId, setSelectedId] = useState(null);
//   const [params, setParams] = useState([]);
//   function onCheckboxChange(newStateFn) {
//     setParams(newStateFn);
//   }

//   return (
//     <HStack>
//       <PresetConfig selectedId={selectedId} setSelectedId={setSelectedId} />
//       <Box maxHeight="500px" overflowY="auto">
//         <ParameterList onCheckboxChange={onCheckboxChange} />
//       </Box>
//       <SetProjectDefault params={params} uiTypeId={selectedId} />
//     </HStack>
//   );
// }

// function SetProjectDefault({ params, uiTypeId }) {
//   const overrideUITypeIds = useStoreActions(
//     (x) => x.paramInfos.overrideUITypeIds
//   );
//   const setManyUITypeIds = useStoreActions(
//     (x) => x.projectParamDefaults.setManyUITypeIds
//   );

//   function onSetAsProjectDefault(overrideLevel = PROJECT_DEFAULT) {
//     return () => {
//       const toUITypeId = _.zipObject(
//         params,
//         _.fill(Array(params.length), { uiTypeId })
//       );
//       setManyUITypeIds({ toUITypeId });
//       overrideUITypeIds({
//         toUITypeId,
//         overrideLevel,
//       });
//     };
//   }

//   function onOverrideExisting() {
//     return onSetAsProjectDefault(SET_FROM_SIDEPANE);
//   }

//   const isDisabled = params.length === 0 || !uiTypeId;

//   return (
//     <>
//       <Button
//         variant="outline"
//         size="sm"
//         onClick={onSetAsProjectDefault()}
//         isDisabled={isDisabled}
//       >
//         Set as project default
//       </Button>
//       <Button
//         variant="outline"
//         size="sm"
//         onClick={onOverrideExisting()}
//         isDisabled={isDisabled}
//       >
//         Override existing
//       </Button>
//     </>
//   );
// }

// function PresetConfig({ selectedId, setSelectedId }) {
//   const setUIType = useStoreActions((x) => x.uiTypes.setUIType);
//   const [uiType, setConfig] = usePresetUIType(selectedId);
//   const defaultConfig = uiType ? uiType.config : {};
//   const [localConfig, setLocalConfig] = useState(defaultConfig);

//   useDeepCompareEffect(() => {
//     setLocalConfig(defaultConfig);
//   }, [defaultConfig]);

//   function onDropdownSelect(e) {
//     setSelectedId(e);
//   }

//   function onConfigChange(configName, newStateFn) {
//     setLocalConfig((x) => ({ ...x, [configName]: newStateFn(x[configName]) }));
//   }

//   function onSave() {
//     setConfig(localConfig);
//   }

//   function onSaveAs(name) {
//     const newUIType = cloneNewUIType({
//       uiType,
//       name,
//       config: localConfig,
//       origin: PROJECT_DEFAULT,
//       presetType: USER,
//       originInfoId: createOriginInfoId({ presetType }),
//     });
//     setUIType({ uiType: newUIType });
//     setSelectedId(newUIType.id);
//   }

//   return (
//     <VStack>
//       <UIConfigDropdownAndFields
//         onDropdownSelect={onDropdownSelect}
//         selectedId={uiType?.id}
//         selectedType={uiType?.type}
//         onConfigChange={onConfigChange}
//         savedConfig={localConfig}
//         origin={PROJECT_DEFAULT}
//       />
//       {uiType && <SaveButton presetName={uiType?.name} onSavePreset={onSave} />}
//       {uiType && <SaveAsButton onSavePreset={onSaveAs} />}
//     </VStack>
//   );
// }

// function SaveButton({ presetName, onSavePreset }) {
//   return (
//     <Button
//       variant="outline"
//       size="sm"
//       onClick={onSavePreset}
//       isDisabled={!presetName}
//     >
//       Save
//     </Button>
//   );
// }

// function SaveAsButton({ onSavePreset }) {
//   const [presetName, setPresetName] = useState("");

//   function onPresetNameChange(e) {
//     setPresetName(e.target.value);
//   }

//   function localOnSavePreset() {
//     onSavePreset(presetName);
//   }

//   return (
//     <Popover>
//       <PopoverTrigger>
//         <Button variant="outline" size="sm">
//           Save As
//         </Button>
//       </PopoverTrigger>
//       <PopoverContent>
//         <PopoverArrow />
//         <PopoverBody>
//           <Input
//             placeholder="Preset Name"
//             value={presetName}
//             onChange={onPresetNameChange}
//           />
//           <SaveButton
//             presetName={presetName}
//             onSavePreset={localOnSavePreset}
//           />
//         </PopoverBody>
//       </PopoverContent>
//     </Popover>
//   );
// }

// function ParameterList(props) {
//   const info = useStoreState((x) => x.master.allPackageInfo.children);
//   return <InfoList info={info} {...props} />;
// }

// function InfoList({ info, m = 0, ...props }) {
//   return (
//     <List m={m}>
//       {_.values(info).map((x, idx) => (
//         <ListItem key={`${x.name}-${idx}`}>
//           <>
//             {x.children ? (
//               <HigherItem x={x} m={m} {...props} />
//             ) : (
//               <ParameterItem x={x} {...props} />
//             )}
//           </>
//         </ListItem>
//       ))}
//     </List>
//   );
// }

// function HigherItem({ x, m, ...props }) {
//   return (
//     <>
//       {x.name}
//       <InfoList info={x.children} m={m + 5} {...props} />
//     </>
//   );
// }

// function _ParameterItem({ x, onCheckboxChange }) {
//   function onChange(e) {
//     onCheckboxChange(checkboxChangeFn(e, x.id));
//   }
//   return <ClickableDiv onClick={onChange}>{x.name}</ClickableDiv>;
// }

// const ParameterItem = React.memo(_ParameterItem, (p, n) => p.x.id === n.x.id);

// function ClickableDiv({ onClick, children }) {
//   const [isSelected, setIsSelected] = useState(false);

//   function _onClick() {
//     const newIsSelected = !isSelected;
//     setIsSelected(newIsSelected);
//     onClick({ target: { checked: newIsSelected } });
//   }

//   return (
//     <div
//       onClick={_onClick}
//       style={{
//         backgroundColor: isSelected ? "grey" : "white",
//       }}
//     >
//       {children}
//     </div>
//   );
// }
