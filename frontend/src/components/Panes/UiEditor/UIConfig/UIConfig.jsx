import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { TextAreaPopover } from "components/Utils/atoms/popover/textareapopover";
import { ScrollingArea } from "components/Utils/atoms/scrollingarea/scrollingarea";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import _ from "lodash";
import React, { useState } from "react";
import { BiPencil } from "react-icons/bi";
import { setCodeInfoDescription } from "state/actions/codeInfo";
import { setParamUITypeConfig } from "state/actions/uiTypes/setParamUITypeConfig";
import { setParamUITypeId } from "state/actions/uiTypes/setParamUITypeId";
import { useCodeInfo } from "state/definitions";
import { useGetParamInfosThatHaveNames } from "state/hooks/sectionContents";
import { useGetParamUIType } from "state/hooks/uiTypes";
import { useMatchSorterFilter } from "state/hooks/utils";
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
    "flex-grow outline-0 min-w-0 w-full cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800 focus-visible:!border-blue-300 pl-7 py-1 truncate";

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-hidden">
      <StandardSearch
        inputStyles={inputStyles}
        leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <ScrollingArea styles="mt-4 flex flex-col gap-2">
        {sectionId &&
          filteredList.map((e, idx) => (
            <UIElement
              sectionId={sectionId}
              paramInfo={e}
              key={`${e.name}-${idx}`}
            />
          ))}
      </ScrollingArea>
    </div>
  );
});

export const UIConfig = React.memo(_UIConfig);

function _UIElement({ sectionId, paramInfo }) {
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
    <div className="flex flex-col self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-setta-200">
      <div className="grid grid-cols-1 grid-rows-1 items-center">
        <p className="uicfg-title col-start-1 col-end-2 row-start-1 row-end-2 text-sm uppercase tracking-widest text-setta-500">
          {paramName}
        </p>
        <div className="col-start-1 col-end-2 row-start-1 row-end-2 flex gap-[0.1rem] place-self-end">
          {/* <InfoViewDescription
            sectionId={sectionId}
            paramInfoId={paramInfoId}
          /> */}
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
        setCodeInfoDescription({ id: paramInfoId, description: value });
      }}
      value={value}
      onChange={(e) => setValue(e.target.value)}
    />
  );
}
