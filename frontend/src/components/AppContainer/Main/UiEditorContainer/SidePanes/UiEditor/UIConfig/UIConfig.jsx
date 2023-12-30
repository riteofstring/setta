import { useMatchSorterFilter } from "hooks/useMatchSorterFilter";
import { useGetParamUIType } from "hooks/useParamUIType";
import { useGetParamInfos } from "hooks/useSectionContents";
import _ from "lodash";
import { useInfoView } from "models/info/infoView";
import { useUITypes } from "models/info/uiTypes";
import React, { useState } from "react";
import { BiFilter, BiPencil } from "react-icons/bi";
import { cloneNewUIType } from "thunks/uiTypes/cloneUITypes";
import { setParamUITypeConfig } from "thunks/uiTypes/setParamUITypeConfig";
import { setParamUITypeId } from "thunks/uiTypes/setParamUITypeId";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { TextAreaPopover } from "utils/atoms/popover/textareapopover";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { PresetType } from "z_utils/types/uiType";
import { isPreset } from "z_utils/uiTypeConstants";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

const UIElement = React.memo(_UIElement, _.isEqual);

const _UIConfig = React.forwardRef(({ sectionId }, ref) => {
  const paramInfos = useGetParamInfos(sectionId).filter((x) => x.name);

  const [filteredList, setFilter] = useMatchSorterFilter(
    paramInfos,
    ["name"],
    500
  );

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-runcoder-200 dark:border-runcoder-800 focus-visible:border-blue-300 pl-7 py-1";

  return (
    <>
      <StandardSearch
        inputStyles={inputStyles}
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <BiFilter className="text-runcoder-600 dark:text-runcoder-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <ScrollingArea styles="mt-4 -mx-2 px-2 flex flex-col gap-4">
        {sectionId &&
          filteredList.map((e, idx) => (
            <UIElement
              sectionId={sectionId}
              paramInfo={e}
              key={`${e.name}-${idx}`}
            />
          ))}
      </ScrollingArea>
    </>
  );
});

export const UIConfig = React.memo(_UIConfig);

function _UIElement({ sectionId, paramInfo }) {
  const setUIType = useUITypes((x) => x.setUIType);
  const deleteUIType = useUITypes((x) => x.deleteUIType);
  const paramInfoId = paramInfo.id;
  const uiType = useGetParamUIType(sectionId, paramInfoId);
  const paramName = paramInfo.name;

  const onSelect = (e) => {
    setParamUITypeId({
      uiTypeId: e,
      sectionId,
      paramInfoId,
      incrementVersion: true,
    });
  };

  const onChange = (configName, newValueFn) => {
    setParamUITypeConfig({
      sectionId,
      paramInfoId,
      configProps: { configName, newValueFn },
    });
  };

  function onSaveAsSubmit({ filename }) {
    const newUIType = cloneNewUIType({
      uiType,
      name: filename,
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
      className="flex flex-col self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-runcoder-200"
      data-testid={`UIElement ${paramName}`}
    >
      <div className="mb-2 grid grid-cols-1 grid-rows-1 items-center">
        <p className="uicfg-title col-start-1 col-end-2 row-start-1 row-end-2 text-sm uppercase tracking-widest text-slate-500">
          {paramName}
        </p>
        <div className="col-start-1 col-end-2 row-start-1 row-end-2 flex gap-[0.1rem] place-self-end">
          <InfoViewDescription paramInfoId={paramInfoId} />
          <SaveUITypeConfig onSubmit={onSaveAsSubmit} />
        </div>
      </div>

      <UIConfigDropdownAndFields
        onDropdownSelect={onSelect}
        selectedId={uiType.id}
        selectedType={uiType.type}
        onConfigChange={onChange}
        config={uiType.config}
        sectionId={sectionId}
        paramInfoId={paramInfoId}
      />
    </div>
  );
}

function InfoViewDescription({ paramInfoId }) {
  const info = useInfoView((x) => _.defaultTo(x.x[paramInfoId], ""));
  const setInfo = useInfoView((x) => x.setInfo);
  const [value, setValue] = useState(info);
  return (
    <TextAreaPopover
      inputClasses="rounded-lg"
      trigger={
        <IconButton twClasses="" size="w-4 h-4" padding="py-2 px-2">
          <BiPencil className="text-slate-500" />
        </IconButton>
      }
      header={"Description for Infoview"}
      onClick={() => setInfo({ id: paramInfoId, value })}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
