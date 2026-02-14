import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { OnSelectedItemChangeFnType } from "components/Utils/Combobox/ComboboxStateReducer";
import _ from "lodash";
import React from "react";
import {
  getCurrCodeObjVariant,
  getCurrProjectConfigId,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useParamIdsAndNamesForSidePane } from "state/hooks/sectionContents";
import { useShareCapabilities } from "state/hooks/share";
import { useMatchSorterFilterWithDelay } from "state/hooks/utils";
import { route_change_param_impl } from "utils/generatedEndpoints";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";
import type { CodeObjTypeFilterKey } from "./UITypeCombobox";

const UIElement = React.memo(_UIElement, _.isEqual);

function _UIConfig({ sectionId }: { sectionId: string }) {
  const paramInfos = useParamIdsAndNamesForSidePane(sectionId);
  const codeObjTypeFilterKey: CodeObjTypeFilterKey = "sectionParam";

  return (
    <UIConfigCore
      sectionId={sectionId}
      paramInfos={paramInfos}
      codeObjTypeFilterKey={codeObjTypeFilterKey}
    />
  );
}

export const UIConfig = React.memo(_UIConfig);

function UIConfigCore({
  sectionId,
  paramInfos,
  codeObjTypeFilterKey,
}: {
  sectionId: string;
  paramInfos: Array<{ id: string; name: string }>;
  codeObjTypeFilterKey: CodeObjTypeFilterKey;
}) {
  const [filteredList, setFilter] = useMatchSorterFilterWithDelay(
    paramInfos,
    ["name"],
    50,
  );

  const inputStyles =
    "flex-grow outline-0 min-w-0 w-full cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800 focus-visible:!border-blue-300 pl-5 py-1 truncate placeholder-setta-400 dark:placeholder-setta-700 text-sm";

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-hidden">
      <StandardSearch
        inputStyles={inputStyles}
        // leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <i className="gg-sort-az !scale-75  text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="mt-4 flex flex-col gap-2 overflow-x-hidden overflow-y-scroll [&>*]:mx-[2px]">
        {filteredList.map((e) => (
          <UIElement
            sectionId={sectionId}
            paramInfo={e}
            codeObjTypeFilterKey={codeObjTypeFilterKey}
            key={e.id}
          />
        ))}
      </div>
    </div>
  );
}

function _UIElement({
  sectionId,
  paramInfo,
  codeObjTypeFilterKey,
}: {
  sectionId: string;
  paramInfo: { id: string; name: string };
  codeObjTypeFilterKey: CodeObjTypeFilterKey;
}) {
  const paramInfoId = paramInfo.id;
  const { canEditStructure } = useShareCapabilities();
  const baseImplId = useProjectState((x) => {
    return getCurrCodeObjVariant(x, sectionId, paramInfoId).impl;
  }, _.isEqual);
  const paramName = paramInfo.name;

  const onSelect: OnSelectedItemChangeFnType<string> = (selectedId) => {
    if (!canEditStructure) {
      return;
    }
    if (!selectedId) {
      throw new Error();
    }
    route_change_param_impl({
      projectConfigId: getCurrProjectConfigId(),
      sectionId,
      paramInfoId,
      selectedId,
    });
  };

  return (
    <div className="flex flex-col self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-setta-200">
      <div className="flex items-center justify-between">
        <p className="uicfg-title  truncate text-xs font-semibold text-setta-500">
          {paramName}
        </p>
        <div className="flex gap-[0.1rem] place-self-end">
          <SaveUITypeConfig />
        </div>
      </div>

      <UIConfigDropdownAndFields
        sectionId={sectionId}
        paramInfoId={paramInfoId}
        baseImplId={baseImplId}
        codeObjTypeFilterKey={codeObjTypeFilterKey}
        onDropdownSelect={onSelect}
      />
    </div>
  );
}
