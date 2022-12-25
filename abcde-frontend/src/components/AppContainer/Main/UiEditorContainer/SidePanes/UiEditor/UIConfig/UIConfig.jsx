import { useGetParamChildId } from "hooks/useEnteredValue";
import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useGetParamUIType } from "hooks/useParamUIType";
import { useGetCurrObjParamKwargInfos } from "hooks/useSectionContents";
import { useActiveSection } from "models/activeSection";
import { useUITypes } from "models/info/uiTypes";
import React, { useState } from "react";
import { setParamUITypeConfig, setParamUITypeId } from "thunks/uiTypes";
import StandardSearch from "utils/atoms/search/StandardSearch";
import { SET_FROM_SIDEPANE } from "utils/constants";
import { PopoverWrapper } from "utils/PopoverWrapper/PopoverWrapper";
import { USER } from "utils/uiTypeConstants";
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

  return (
    <div className="items-stretch">
      <div className="pb-10">
        <StandardSearch
          simpleSearch={true}
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
      presetType: USER,
    });
    setUIType({ uiType: newUIType });
    setParamUITypeId({
      uiTypeId: newUIType.id,
      sectionId,
      paramInfoId,
    });
    // delete old uitype if its a non-preset
    if (!uiType.presetType) {
      deleteUIType({ uiTypeId: uiType.id });
    }
  }

  return (
    <div
      className="flex flex-col text-left self-stretch hover:opacity-100 hover:duration-500 [&:hover_.uicfg-save]:visible [&:hover_.uicfg-save]:opacity-100 [&:hover_.uicfg-save]:duration-500"
      data-testid={`UIElement ${paramName}`}
    >
      <h3 className="text-sm text-gray-500 uppercase tracking-widest">
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
        origin={SET_FROM_SIDEPANE}
      />
      <SaveLoadButtons onSubmit={onSaveAsSubmit} />
    </div>
  );
}

function SaveLoadButtons({ onSubmit }) {
  return (
    <div className="flex flex-row pb-6">
      <div className="flex-1" />
      <PopoverWrapper
        trigger={
          <button className="uicfg-save text-xs text-gray-500 invisible opacity-0">
            Save As
          </button>
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
      <button onClick={localOnSubmit}>Done</button>
    </>
  );
}
