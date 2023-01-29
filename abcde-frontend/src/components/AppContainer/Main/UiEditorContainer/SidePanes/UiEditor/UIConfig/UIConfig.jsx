import { PresetType } from "abcde-utils/src/types/uiType";
import { isPreset } from "abcde-utils/src/uiTypeConstants";
import { ButtonGoToSectionConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ButtonGoToSectionConfig";
import { useGetParamChildId } from "hooks/useEnteredValue";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useGetParamUIType } from "hooks/useParamUIType";
import { useGetCurrObjParamKwargInfos } from "hooks/useSectionContents";
import _ from "lodash";
import { useUITypes } from "models/info/uiTypes";
import React, { useState } from "react";
import { VscSaveAs } from "react-icons/vsc";
import { setParamUITypeConfig, setParamUITypeId } from "thunks/uiTypes";
import { Button } from "utils/atoms/buttons/Button";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { CodeGenPopover } from "utils/atoms/popover/codegenpopover";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { cloneNewUIType } from "utils/uiTypeUtils";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

const UIElement = React.memo(_UIElement, (p, n) => _.isEqual(p, n));

const _UIConfig = React.forwardRef(({ sectionId }, ref) => {
  const paramInfos = useGetCurrObjParamKwargInfos(sectionId).filter(
    (x) => x.name
  );

  const [filteredList, setFilter] = useMatchSorterFilter(
    paramInfos,
    ["name"],
    500
  );

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300 focus-visible:border-blue-300 pl-7 py-1";

  return (
    <div ref={ref}>
      <StandardSearch
        inputStyles={inputStyles}
        leftElementStyles="pl-1"
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="mt-4 flex flex-grow flex-col gap-8 overflow-y-auto">
        {sectionId &&
          filteredList.map((e, idx) => (
            <UIElement
              sectionId={sectionId}
              paramInfo={e}
              key={`${e.name}-${idx}`}
            />
          ))}
      </div>
    </div>
  );
});

export const UIConfig = React.memo(_UIConfig);

function _UIElement({ sectionId, paramInfo }) {
  const setUIType = useUITypes((x) => x.setUIType);
  const deleteUIType = useUITypes((x) => x.deleteUIType);
  const paramInfoId = paramInfo.id;
  const paramChildId = useGetParamChildId(sectionId, paramInfoId);
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const paramName = paramInfo.name;

  const onSelect = (e) => {
    setParamUITypeId({
      uiTypeId: e,
      sectionId,
      paramInfoId,
    });
  };

  const onChange = (configName, newValueFn) => {
    setParamUITypeConfig({
      sectionId,
      paramInfoId,
      configProps: { configName, newValueFn },
    });
  };

  function onSaveAsSubmit(presetName) {
    const newUIType = cloneNewUIType({
      uiType,
      name: presetName,
      presetType: PresetType.USER,
    });
    setUIType({ uiType: newUIType });
    setParamUITypeId({
      uiTypeId: newUIType.id,
      sectionId,
      paramInfoId,
    });
    // delete old uitype if its a non-preset
    if (!isPreset(uiType)) {
      deleteUIType({ uiTypeId: uiType.id });
    }
  }

  return (
    <div
      className="flex flex-col self-stretch text-left hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black"
      data-testid={`UIElement ${paramName}`}
    >
      <div className="mb-2 grid grid-cols-1 grid-rows-1 items-center">
        <h3 className="uicfg-title col-start-1 col-end-2 row-start-1 row-end-2 text-sm uppercase tracking-widest text-gray-500">
          {paramName}
        </h3>
        <SaveAndConfig paramChildId={paramChildId} onSubmit={onSaveAsSubmit} />
      </div>

      <UIConfigDropdownAndFields
        onDropdownSelect={onSelect}
        selectedId={uiType.id}
        selectedType={uiType.type}
        onConfigChange={onChange}
        savedConfig={uiType.config}
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        paramChildId={paramChildId}
      />
      <ButtonGoToSectionConfig uiType={uiType} paramChildId={paramChildId} />
    </div>
  );
}

function SaveAndConfig({ onSubmit, paramChildId }) {
  return (
    <CodeGenPopover
      trigger={
        <IconButton
          twClasses="row-start-1 row-end-2 col-start-1 col-end-2 place-self-end"
          size="w-4 h-4"
          padding="py-2 px-2"
        >
          <VscSaveAs className="text-gray-500" />
        </IconButton>
      }
      body={<SubmitAsPreset onSubmit={onSubmit} />}
    />
  );
}

function SubmitAsPreset({ onSubmit }) {
  const [presetName, setPresetName] = useState("");

  function onChange(e) {
    setPresetName(e.target.value);
  }

  function localOnSubmit() {
    onSubmit(presetName);
  }

  return (
    <>
      <input placeholder="Preset Name" onChange={onChange} value={presetName} />
      <Button onClick={localOnSubmit}>Done</Button>
    </>
  );
}
