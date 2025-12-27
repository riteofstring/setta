import * as Switch from "@radix-ui/react-switch";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import _ from "lodash";
import React from "react";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrEffectiveCodeObjImpl,
  getCurrProjectConfigId,
  setCurrEffectiveCodeObjImplValue,
} from "state/actions/sectionInfos";
import { useProjectState } from "state/definitions";
import { useParamIdsAndNamesForSidePane } from "state/hooks/sectionContents";
import {
  useLocalValue,
  useMatchSorterFilterWithDelay,
} from "state/hooks/utils";
import {
  route_set_code_obj_display_name,
  route_set_show_param_display_names,
  route_update_param_impl_config,
} from "utils/generatedEndpoints";

const UIElement = React.memo(_UIElement, _.isEqual);

function _QuickInfoConfig({ sectionId }) {
  const paramInfos = useParamIdsAndNamesForSidePane(sectionId, "true");
  return <QuickInfoConfigCore sectionId={sectionId} paramInfos={paramInfos} />;
}

export const QuickInfoConfig = React.memo(_QuickInfoConfig);

function QuickInfoConfigCore({ sectionId, paramInfos }) {
  const showParamDisplayNames = useProjectState(
    (x) => x.projectConfig.showParamDisplayNames,
  );
  const [filteredList, setFilter] = useMatchSorterFilterWithDelay(
    paramInfos,
    ["name"],
    50,
  );

  const inputStyles =
    "flex-grow outline-0 min-w-0 w-full cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-setta-200 dark:border-setta-800 focus-visible:!border-blue-300 pl-5 py-1 truncate placeholder-setta-400 dark:placeholder-setta-700 text-sm";
  const toggleRootClasses =
    "items-center p-[0.2rem] w-7 min-w-7 h-2.5 bg-setta-400 dark:bg-setta-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 disabled:pointer-events-none";
  const toggleThumbClasses =
    "block w-2.5 h-2.5 bg-white dark:bg-setta-800 rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 flex";

  function onToggleDisplayNames(checked: boolean) {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        state.projectConfig.showParamDisplayNames = checked;
      },
      send: (frontendOpId) =>
        route_set_show_param_display_names({
          projectConfigId: getCurrProjectConfigId(),
          showParamDisplayNames: checked,
          frontendOpId,
        }),
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-1 overflow-y-hidden">
      <aside className="mb-2 flex items-center justify-between">
        <p className="text-xs text-setta-500">Show display names</p>
        <Switch.Root
          className={toggleRootClasses}
          checked={showParamDisplayNames}
          onCheckedChange={onToggleDisplayNames}
        >
          <Switch.Thumb className={toggleThumbClasses} />
        </Switch.Root>
      </aside>
      <StandardSearch
        inputStyles={inputStyles}
        // leftElementStyles="pl-1"
        placeholder="Filter"
        leftElement={
          <i className="gg-sort-az !scale-75 text-setta-600 dark:text-setta-400" />
        }
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="mt-4 flex flex-col gap-2 overflow-y-scroll [&>*]:mx-[2px]">
        {sectionId &&
          filteredList.map((e, idx) => (
            <UIElement sectionId={sectionId} paramInfo={e} key={e.id} />
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
  const { id, name } = paramInfo;
  const { description, displayName, trueName } = useProjectState((x) => {
    const codeObj = x.codeObjs[id];
    if (!codeObj) {
      return {
        description: "",
        displayName: "",
        trueName: "",
      };
    }
    const impl = getCurrEffectiveCodeObjImpl(x, sectionId, id);
    return {
      description: impl.description,
      displayName: codeObj.displayName,
      trueName: codeObj.name,
    };
  }, _.isEqual);
  const [localDescription, setLocalDescription] = useLocalValue(description);

  function onDisplayNameChange(e: React.ChangeEvent<HTMLInputElement>) {
    const nextValue = e.target.value;
    useProjectState.setState((state) => {
      const codeObj = state.codeObjs[id];
      if (!codeObj) {
        return;
      }
      codeObj.displayName = nextValue;
    });
    debouncedSetParamDisplayName(id, nextValue);
  }

  function onDescriptionChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const nextValue = e.target.value;
    setLocalDescription(nextValue);
    debouncedSetParamDescription(sectionId, id, nextValue);
  }

  const title = trueName || name;

  return (
    <div className="flex flex-col gap-2 self-stretch text-left last:mb-[400px] hover:opacity-100 hover:duration-500 [&:hover_.uicfg-title]:text-black dark:[&:hover_.uicfg-title]:text-setta-200">
      <p className="uicfg-title truncate text-xs font-semibold text-setta-500">
        {title}
      </p>
      <input
        className="mx-[2px] h-7 min-w-0 flex-grow cursor-auto rounded-lg border border-solid border-setta-100 bg-white px-2 py-1 font-mono text-xs font-medium text-setta-600 outline-0 placeholder:text-setta-200 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300 dark:placeholder:text-setta-700 dark:focus-visible:border-setta-900"
        placeholder={trueName}
        value={displayName}
        onChange={onDisplayNameChange}
      />
      <textarea
        className="mx-[2px] mb-4 h-12 min-w-0 flex-grow cursor-auto rounded-lg border border-solid border-setta-100 bg-white px-2 py-1 font-mono text-xs font-medium text-setta-600 outline-0 placeholder:text-setta-200 focus-visible:border-white focus-visible:ring-2 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300 dark:placeholder:text-setta-700 dark:focus-visible:border-setta-900"
        value={localDescription}
        onChange={onDescriptionChange}
      />
    </div>
  );
}

const debouncedSetParamDisplayName = _.debounce(
  (codeObjId: string, displayName: string) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        const codeObj = state.codeObjs[codeObjId];
        if (!codeObj) {
          return;
        }
        codeObj.displayName = displayName;
      },
      send: (frontendOpId) =>
        route_set_code_obj_display_name({
          projectConfigId: getCurrProjectConfigId(),
          codeObjId,
          displayName,
          frontendOpId,
        }),
    });
  },
  200,
);

const debouncedSetParamDescription = _.debounce(
  (sectionId: string, codeObjId: string, description: string) => {
    dispatchOptimisticProjectStateUpdate({
      apply: (state) => {
        setCurrEffectiveCodeObjImplValue<"BaseCodeObj">(
          state,
          sectionId,
          codeObjId,
          { description },
        );
      },
      send: (frontendOpId) =>
        route_update_param_impl_config({
          projectConfigId: getCurrProjectConfigId(),
          sectionId,
          paramInfoId: codeObjId,
          newConfig: { description },
          frontendOpId,
        }),
    });
  },
  200,
);
