import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import _ from "lodash";
import React from "react";
import { getEffectiveCodeObjImpl } from "state/actions/sectionInfos";
import { setParamUITypeId } from "state/actions/uiTypes/setParamUITypeId";
import { useProjectState } from "state/definitions";
import { useParamIdsAndNamesForSidePane } from "state/hooks/sectionContents";
import { useMatchSorterFilterWithDelay } from "state/hooks/utils";
import { SaveUITypeConfig } from "../SaveUITypeConfig";
import { UIConfigDropdownAndFields } from "./UIConfigDropdownAndFields";

const UIElement = React.memo(_UIElement, _.isEqual);

function _UIConfig({ sectionId }: { sectionId: string }) {
  const paramInfos = useParamIdsAndNamesForSidePane(sectionId);
  return <UIConfigCore sectionId={sectionId} paramInfos={paramInfos} />;
}

export const UIConfig = React.memo(_UIConfig);

function UIConfigCore({
  sectionId,
  paramInfos,
}: {
  sectionId: string;
  paramInfos: Array<{ id: string; name: string }>;
}) {
  const [filteredList, setFilter] = useMatchSorterFilterWithDelay(
    paramInfos,
    ["name"],
    50,
  );

  const inputStyles =
    "flex-grow outline-0 min-w-0 w-full cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800 focus-visible:!border-blue-300 pl-5 py-1 truncate placeholder-setta-400 dark:placeholder-setta-700 text-sm";

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-hidden">
      <StandardSearch
        inputStyles={inputStyles}
        // leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <i className="gg-sort-az !scale-75  text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="mt-4 flex flex-col gap-2 overflow-y-scroll [&>*]:mx-[2px]">
        {filteredList.map((e, idx) => (
          <UIElement
            sectionId={sectionId}
            paramInfo={e}
            key={`${e.name}-${idx}`}
          />
        ))}
      </div>
    </div>
  );
}

function _UIElement({
  sectionId,
  paramInfo,
}: {
  sectionId: string;
  paramInfo: { id: string; name: string };
}) {
  const paramInfoId = paramInfo.id;
  const implType = useProjectState((x) => {
    const impl = getEffectiveCodeObjImpl(x, paramInfo.id, sectionId, null);
    return impl.type;
  }, _.isEqual);
  const paramName = paramInfo.name;

  const onSelect = (e) => {
    useProjectState.setState((state) => {
      setParamUITypeId({
        uiTypeId: e,
        sectionId,
        paramInfoId,
        state,
      });
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
        implType={implType}
        onDropdownSelect={onSelect}
        // selectedId={uiType.id}
        // selectedType={uiType.type}
      />
    </div>
  );
}
