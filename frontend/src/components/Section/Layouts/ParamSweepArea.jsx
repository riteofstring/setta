import { ParamSweepUI } from "components/Params/ParamUIs/ParamUI";
import { YamlView } from "components/Params/YamlView";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import C from "constants/constants.json";
import _ from "lodash";
import React from "react";
import { FiEdit3 } from "react-icons/fi";
import {
  addParamSweepCallable,
  addParamSweepParamInfoId,
  addParamSweepValue,
  changeParamSweepParamInfoId,
  deleteLastParamSweepParamInfoId,
  deleteLastParamSweepValue,
  deleteParamSweepValue,
  setParamSweepValue,
} from "state/actions/runGroups/paramSweep";
import { getParamIds } from "state/actions/sections/sectionContents";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { useSectionCodeInfoChildren } from "state/hooks/codeInfoCols";
import { useParamSweepInfo } from "state/hooks/paramSweep";
import { useSectionTypeName } from "state/hooks/uiTypes";
import { ParamSweepSectionSearch } from "../SectionParts/Search";
import { useShowYaml } from "./toYaml";

function _ParamSweepArea({ sectionId }) {
  const { showYaml, yamlValue, setYamlValue } = useShowYaml(sectionId);
  return !showYaml ? (
    <ParamSweepAreaGUI sectionId={sectionId} />
  ) : (
    <YamlView
      sectionId={sectionId}
      yamlValue={yamlValue}
      setYamlValue={setYamlValue}
    />
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

function _ParamSweepAreaGUI({ sectionId }) {
  const { paramSweepId, paramSweep, forSectionId } =
    useParamSweepInfo(sectionId);

  const showParamSweepSectionSearch =
    useShowParamSweepSectionSearch(forSectionId);

  function onAddCallableClick() {
    addParamSweepCallable({ paramSweepId });
  }

  return (
    <>
      <div className="section-main-full-w ml-1.5 flex flex-col overflow-x-clip overflow-y-scroll">
        {!showParamSweepSectionSearch && (
          <AddRemoveButtonsForNoCallableSection
            forSectionId={forSectionId}
            paramSweepId={paramSweepId}
            paramSweep={paramSweep}
          />
        )}
        {paramSweep.length > 0 ? (
          paramSweep.map((sweep, idx) => (
            <ParamSweepForOneSelectedItem
              key={`${idx}-${sweep.selectedItem}`}
              sectionId={sectionId}
              forSectionId={forSectionId}
              sweep={sweep}
              paramSweepId={paramSweepId}
              selectedItemIdx={idx}
              showParamSweepSectionSearch={showParamSweepSectionSearch}
            />
          ))
        ) : (
          <div className="section-main-full-w single-cell-container h-full place-items-center">
            <FiEdit3 className="single-cell-child h-10 w-10 text-setta-200 dark:text-setta-700 " />
          </div>
        )}
        {showParamSweepSectionSearch && (
          <button
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500/30 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-setta-200  dark:text-setta-400 dark:hover:bg-setta-900"
            onClick={onAddCallableClick}
          >
            <i className="gg-play-list-add !scale-75" />
            <p>Callable</p>
          </button>
        )}
      </div>
    </>
  );
}

export const ParamSweepAreaGUI = React.memo(_ParamSweepAreaGUI);

function ParamSweepForOneSelectedItem({
  sectionId,
  forSectionId,
  sweep,
  paramSweepId,
  selectedItemIdx,
  showParamSweepSectionSearch,
}) {
  const alreadySelected = sweep.params.map((x) => x.paramInfoId);
  const { onClickAddParam, disabled: disablePlusButton } = useOnClickAddParam({
    forSectionId,
    paramSweepId,
    selectedItem: sweep.selectedItem,
    selectedItemIdx,
    alreadySelected,
  });

  const onClickRemoveParam = () =>
    deleteLastParamSweepParamInfoId({ paramSweepId, selectedItemIdx });

  return (
    <div className="section-min-rows section-grid-cols section-grid-sweep-areas mb-4 grid">
      {showParamSweepSectionSearch && (
        <ParamSweepSectionSearch
          sectionId={sectionId}
          forSectionId={forSectionId}
          selectedItem={sweep.selectedItem}
          paramSweepId={paramSweepId}
          selectedItemIdx={selectedItemIdx}
          onPlusClick={onClickAddParam}
          onMinusClick={onClickRemoveParam}
          disablePlusButton={disablePlusButton}
        />
      )}
      <Args
        paramSweepId={paramSweepId}
        objInfoId={sweep.selectedItem}
        paramSweep={sweep.params}
        forSectionId={forSectionId}
        sectionId={sectionId}
        selectedItemIdx={selectedItemIdx}
        alreadySelected={alreadySelected}
        showParamSweepSectionSearch={showParamSweepSectionSearch}
      />
    </div>
  );
}

function Args({
  paramSweepId,
  objInfoId,
  paramSweep,
  forSectionId,
  sectionId,
  selectedItemIdx,
  alreadySelected,
  showParamSweepSectionSearch,
}) {
  return (
    <section className="section-row-main nowheel section-w-full section-min-rows grid grid-cols-subgrid gap-y-1">
      {paramSweep.map((x, idx) => (
        <ArgItem
          key={`${selectedItemIdx}-${x.paramInfoId}-${idx}`}
          objInfoId={objInfoId}
          paramSweepId={paramSweepId}
          paramIdx={idx}
          singleParamSweep={x}
          alreadySelected={alreadySelected}
          forSectionId={forSectionId}
          sectionId={sectionId}
          selectedItemIdx={selectedItemIdx}
          showParamSweepSectionSearch={showParamSweepSectionSearch}
        />
      ))}
    </section>
  );
}

function ArgItem({
  objInfoId,
  paramSweepId,
  paramIdx,
  singleParamSweep,
  alreadySelected,
  forSectionId,
  sectionId,
  selectedItemIdx,
  showParamSweepSectionSearch,
}) {
  const { paramInfoId, values } = singleParamSweep;

  function getOnChange(valueIdx) {
    return (v) =>
      setParamSweepValue({
        paramSweepId,
        selectedItemIdx,
        paramIdx,
        valueIdx,
        value: _.toString(v),
      });
  }

  function getOnDelete(valueIdx) {
    return () =>
      deleteParamSweepValue({
        paramSweepId,
        selectedItemIdx,
        paramIdx,
        valueIdx,
      });
  }

  function onPlus() {
    if (paramInfoId) {
      addParamSweepValue({ paramSweepId, selectedItemIdx, paramIdx });
    }
  }

  function onMinus() {
    deleteLastParamSweepValue({ paramSweepId, selectedItemIdx, paramIdx });
  }

  function onSelectedItemChange(v) {
    changeParamSweepParamInfoId({
      paramSweepId,
      selectedItemIdx,
      paramIdx,
      paramInfoId: v,
    });
  }
  // <article className="nodrag nowheel section-key-value auto-rows-min grid grid-cols-subgrid py-1">

  return (
    <>
      <div className="section-w-full mt-1 flex min-w-0 items-center">
        <ParamCombobox
          objInfoId={objInfoId}
          paramInfoId={paramInfoId}
          onSelectedItemChange={onSelectedItemChange}
          alreadySelected={alreadySelected}
          forSectionId={forSectionId}
          showParamSweepSectionSearch={showParamSweepSectionSearch}
        />

        <div className="flex items-center pl-0.5">
          <button
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
            onClick={onMinus}
          >
            <i className="gg-remove" />
          </button>
          <button
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
            onClick={onPlus}
          >
            <i className="gg-add" />
          </button>
        </div>
      </div>
      {paramInfoId &&
        values.map((x, valueIdx) => (
          <Input
            forSectionId={forSectionId}
            paramInfoId={paramInfoId}
            key={`${paramInfoId}-${valueIdx}`}
            onChange={getOnChange(valueIdx)}
            onDelete={getOnDelete(valueIdx)}
            value={x}
            sectionId={sectionId}
          />
        ))}
    </>
  );
}

function ParamCombobox({
  objInfoId,
  paramInfoId,
  alreadySelected = [],
  onSelectedItemChange,
  forSectionId,
  showParamSweepSectionSearch,
}) {
  const objParams = useChildlessObjParams({
    objInfoId,
    paramInfoId,
    alreadySelected,
    forSectionId,
  });

  return (
    <IdNameCombobox
      allItems={[{ group: "Args", items: objParams }]}
      value={paramInfoId}
      onSelectedItemChange={onSelectedItemChange}
      placeholder="Filter & Add Sweep"
      outerDivClasses={`section-w-full justify-center not:last-child:mt-3 ${showParamSweepSectionSearch ? "ml-3" : ""} `}
      small={true}
      bg="bg-transparent"
    />
  );
}

function Input({
  sectionId,
  forSectionId,
  paramInfoId,
  onChange,
  onDelete,
  value,
}) {
  return (
    <div className="group contents">
      <button
        className="section-left-gutter ml-2 flex h-[0.66rem] w-[0.66rem] cursor-pointer items-center justify-center place-self-center bg-transparent text-transparent opacity-75 hover:!text-setta-600 group-hover:text-setta-300 dark:hover:!text-setta-200 group-hover:dark:text-setta-600"
        onClick={onDelete}
        tabIndex="-1"
      >
        <i className="gg-close !scale-50" />
      </button>
      <article className="section-key-value group/arg-group group/textinput mr-3  grid grid-cols-subgrid items-center justify-between rounded-lg">
        <ParamSweepUI
          dataSectionId={forSectionId}
          visualSectionId={sectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          className="nodrag"
          keywordPositions={[]}
          setKeywordPositions={() => {}}
        />
      </article>
    </div>
  );
}

function AddRemoveButtonsForNoCallableSection({
  forSectionId,
  paramSweepId,
  paramSweep,
}) {
  const alreadySelected = paramSweep[0]?.params.map((x) => x.paramInfoId) ?? [];
  const selectedItemIdx = paramSweep.length > 0 ? 0 : null;

  const { onClickAddParam, disabled: disablePlusButton } = useOnClickAddParam({
    forSectionId,
    paramSweepId,
    selectedItem: null,
    selectedItemIdx,
    alreadySelected,
  });

  const onClickRemoveParam = () =>
    deleteLastParamSweepParamInfoId({ paramSweepId, selectedItemIdx });

  return (
    <div className="mb-0.5 flex rounded-lg bg-setta-100 py-1 pl-0.5 pr-0.5 dark:bg-setta-950">
      <p className="ml-1.5 mr-auto text-xs font-bold tracking-tighter text-setta-500 dark:text-setta-400">
        Add/Remove Parameters
      </p>
      <button
        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
        onClick={onClickRemoveParam}
      >
        <i className="gg-remove" />
      </button>
      <button
        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
        onClick={onClickAddParam}
        disabled={disablePlusButton}
      >
        <i className="gg-add" />
      </button>
    </div>
  );
}

function useShowParamSweepSectionSearch(sectionId) {
  const hideSearch = useSectionInfos((x) => x.x[sectionId].hideSearch);
  const _isGlobalVariables =
    useSectionTypeName(sectionId) === C.GLOBAL_VARIABLES;

  return !hideSearch && !_isGlobalVariables;
}

export function useNumChildlessParams(selectedItem, sectionId) {
  const codeInfoChildren = useSectionCodeInfoChildren(sectionId);

  return useCodeInfo((x) => {
    return getParamIds(sectionId, x.x, codeInfoChildren, selectedItem)[
      "ids"
    ].filter((p) => codeInfoChildren[p].length === 0).length;
  });
}

function useChildlessObjParams({
  objInfoId,
  paramInfoId,
  alreadySelected,
  forSectionId,
}) {
  const codeInfoChildren = useSectionCodeInfoChildren(forSectionId);

  return useCodeInfo((x) => {
    const { ids, pathMap } = getParamIds(
      forSectionId,
      x.x,
      codeInfoChildren,
      objInfoId,
      (p) => p.rcType === C.PARAMETER,
    );
    const output = [];
    for (const f of ids) {
      if (
        (f !== paramInfoId && alreadySelected.includes(f)) ||
        codeInfoChildren[f].length > 0
      ) {
        continue;
      }
      if (pathMap[f].length === 1) {
        output.push({ id: f, name: x.x[pathMap[f][0]].name });
      } else {
        let name = "";
        for (const [pathIdx, currId] of pathMap[f].entries()) {
          if (pathIdx === 0) {
            name = x.x[currId].name;
          } else {
            name += `["${x.x[currId].name}"]`;
          }
        }
        output.push({ id: f, name });
      }
    }
    return output;
  }, _.isEqual);
}

function useOnClickAddParam({
  forSectionId,
  paramSweepId,
  selectedItem,
  selectedItemIdx,
  alreadySelected,
}) {
  function onClickAddParam() {
    addParamSweepParamInfoId({
      paramSweepId,
      selectedItemIdx,
      paramInfoId: null,
    });
  }

  const numParams = useNumChildlessParams(selectedItem, forSectionId);

  return { onClickAddParam, disabled: alreadySelected.length >= numParams };
}
