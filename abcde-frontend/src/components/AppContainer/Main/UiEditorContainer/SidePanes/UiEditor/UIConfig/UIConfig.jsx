import { PresetType } from "abcde-utils/src/types/uiType";
import { isPreset } from "abcde-utils/src/uiTypeConstants";
import { ButtonGoToSectionConfig } from "components/UI/Section/SectionContainer/Main/Group/ParamSwitch/ParamContainer/ParamUIs/ButtonGoToSectionConfig";
import { useGetParamChildId } from "hooks/useEnteredValue";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useGetParamUIType } from "hooks/useParamUIType";
import { useGetCurrObjParamKwargInfos } from "hooks/useSectionContents";
import { useActiveSection } from "models/activeSection";
import { useUITypes } from "models/info/uiTypes";
import React, { useState } from "react";
import { setParamUITypeConfig, setParamUITypeId } from "thunks/uiTypes";
import { Button } from "utils/atoms/buttons/Button";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";
import { cloneNewUIType } from "utils/uiTypeUtils";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

export default React.memo(UIConfig);

function UIConfig() {
  const sectionId = useActiveSection((x) => x.id);
  const paramInfos = useGetCurrObjParamKwargInfos(sectionId).filter(
    (x) => x.name
  );

  const [filteredList, setFilter] = useMatchSorterFilter(
    paramInfos,
    ["name"],
    500
  );

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 pl-7 py-1 ";

  return (
    <div className="items-stretch">
      <div className="pb-10">
        <StandardSearch
          inputStyles={inputStyles}
          leftElementStyles="pl-1"
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>
      {sectionId &&
        filteredList.map((e, idx) => (
          <UIElement
            sectionId={sectionId}
            paramInfo={e}
            key={`${e.name}-${idx}`}
          />
        ))}
    </div>
  );
}

function UIElement({ sectionId, paramInfo }) {
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
      className="flex flex-col text-left self-stretch hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black [&:hover_.uicfg-save]:visible [&:hover_.uicfg-save]:opacity-100 [&:hover_.uicfg-save]:duration-500"
      data-testid={`UIElement ${paramName}`}
    >
      <h3 className="uicfg-title text-sm pb-1 text-gray-500 uppercase tracking-widest">
        {paramName}
      </h3>

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
      <SaveAndConfig paramChildId={paramChildId} onSubmit={onSaveAsSubmit} />
    </div>
  );
}

function SaveAndConfig({ onSubmit, paramChildId }) {
  return (
    <div className="flex flex-row flex-grow pb-4 justify-between">
      <ButtonGoToSectionConfig paramChildId={paramChildId} />
      <PopoverWrapper
        trigger={
          <Button twClasses="uicfg-save mt-2 text-xs text-gray-500 invisible opacity-0 hover:bg-gray-200 text-xs font-bold text-gray-500 py-1 px-2 rounded-md gap-1 select-none">
            Save As
          </Button>
        }
        body={<SubmitAsPreset onSubmit={onSubmit} />}
      />
    </div>
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
