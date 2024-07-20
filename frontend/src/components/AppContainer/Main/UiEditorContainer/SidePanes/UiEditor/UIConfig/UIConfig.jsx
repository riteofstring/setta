import { useMatchSorterFilter } from "state/hooks/useMatchSorterFilter";
import { useGetParamUIType } from "state/hooks/useParamUIType";
import { useGetParamInfosThatHaveNames } from "state/hooks/useSectionContents";
import _ from "lodash";
import { useCodeInfo } from "state/definitions/codeInfo";
import { useUITypes } from "models/info/uiTypes";
import React, { useState } from "react";
import { BiFilter, BiPencil } from "react-icons/bi";
import { updateParams } from "state/actions/sectionContents";
import { setParamUITypeConfig } from "thunks/uiTypes/setParamUITypeConfig";
import { setParamUITypeId } from "thunks/uiTypes/setParamUITypeId";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { TextAreaPopover } from "utils/atoms/popover/textareapopover";
import { ScrollingArea } from "utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

const UIElement = React.memo(_UIElement, _.isEqual);

const _UIConfig = React.forwardRef(({ sectionId }, ref) => {
  const paramInfos = useGetParamInfosThatHaveNames(sectionId);

  const [filteredList, setFilter] = useMatchSorterFilter(
    paramInfos,
    ["name"],
    500,
  );

  const inputStyles =
    "flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800 focus-visible:!border-blue-300 pl-7 py-1";

  return (
    <>
      <StandardSearch
        inputStyles={inputStyles}
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <BiFilter className="text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <ScrollingArea styles="mt-4 -mx-2 px-2 flex flex-col gap-2">
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

  return (
    <div
      className="flex flex-col self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-setta-200"
      data-testid={`UIElement ${paramName}`}
    >
      <div className="grid grid-cols-1 grid-rows-1 items-center">
        <p className="uicfg-title col-start-1 col-end-2 row-start-1 row-end-2 text-sm uppercase tracking-widest text-setta-500">
          {paramName}
        </p>
        <div className="col-start-1 col-end-2 row-start-1 row-end-2 flex gap-[0.1rem] place-self-end">
          <InfoViewDescription
            sectionId={sectionId}
            paramInfoId={paramInfoId}
          />
          <SaveUITypeConfig />
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

function InfoViewDescription({ sectionId, paramInfoId }) {
  const info = useCodeInfo((x) => x.x[paramInfoId].description);
  const [value, setValue] = useState(info);
  return (
    <TextAreaPopover
      inputClasses="rounded-lg"
      trigger={
        <IconButton twClasses="" size="w-4 h-4" padding="py-2 px-2">
          <BiPencil className="text-setta-500" />
        </IconButton>
      }
      header={"Description for Infoview"}
      onClick={() => {
        useCodeInfo
          .getState()
          .setDescription({ id: paramInfoId, description: value });

        updateParams(sectionId);
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
