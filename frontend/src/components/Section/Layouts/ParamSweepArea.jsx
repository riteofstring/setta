import { ParamSweepUI } from "components/Params/ParamUIs/ParamUI";
import { SectionYamlView } from "components/Params/YamlView";
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
import { getCodeInfoCol, getSectionType } from "state/actions/sectionInfos";
import {
  getParamIds,
  paramNameFromPathArray,
} from "state/actions/sections/sectionContents";
import { useSectionInfos } from "state/definitions";
import { useParamSweepInfo } from "state/hooks/paramSweep";
import { useSectionVariantIsFrozen } from "state/hooks/sectionVariants";
import { ParamSweepSectionSearch } from "../SectionParts/Search";
import { useShowYaml } from "./toYaml";

function _ParamSweepArea({ sectionId }) {
  const showYaml = useShowYaml(sectionId);
  return !showYaml ? (
    <ParamSweepAreaGUI sectionId={sectionId} />
  ) : (
    <SectionYamlView sectionId={sectionId} />
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

function _ParamSweepAreaGUI({ sectionId }) {
  const { variantId, paramSweep, forSectionId } = useParamSweepInfo(sectionId);

  const showParamSweepSectionSearch =
    useShowParamSweepSectionSearch(forSectionId);

  function onAddCallableClick() {
    addParamSweepCallable(variantId);
  }

  const isDisabled = useSectionVariantIsFrozen(sectionId);

  console.log("paramSweep", paramSweep);

  return (
    <>
      <div className="section-main-full-w ml-1.5 flex flex-col overflow-x-clip overflow-y-scroll">
        {!showParamSweepSectionSearch && (
          <AddRemoveButtonsForNoCallableSection
            forSectionId={forSectionId}
            variantId={variantId}
            paramSweep={paramSweep}
            isDisabled={isDisabled}
          />
        )}
        {paramSweep.length > 0 ? (
          paramSweep.map((sweep, idx) => (
            <ParamSweepForOneSelectedItem
              key={`${idx}-${sweep.selectedItem}`}
              sectionId={sectionId}
              forSectionId={forSectionId}
              sweep={sweep}
              variantId={variantId}
              selectedItemIdx={idx}
              showParamSweepSectionSearch={showParamSweepSectionSearch}
              isDisabled={isDisabled}
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
            disabled={isDisabled}
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
  variantId,
  selectedItemIdx,
  showParamSweepSectionSearch,
  isDisabled,
}) {
  const alreadySelected = sweep.params.map((x) => x.paramInfoId);
  const { onClickAddParam, disabled: disablePlusButton } = useOnClickAddParam({
    forSectionId,
    variantId,
    selectedItem: sweep.selectedItem,
    selectedItemIdx,
    alreadySelected,
  });

  const onClickRemoveParam = () =>
    deleteLastParamSweepParamInfoId({ variantId, selectedItemIdx });

  return (
    <div className="section-min-rows section-grid-cols section-grid-sweep-areas mb-4 grid">
      {showParamSweepSectionSearch && (
        <ParamSweepSectionSearch
          sectionId={sectionId}
          forSectionId={forSectionId}
          selectedItem={sweep.selectedItem}
          variantId={variantId}
          selectedItemIdx={selectedItemIdx}
          onPlusClick={onClickAddParam}
          onMinusClick={onClickRemoveParam}
          disablePlusButton={disablePlusButton}
          isDisabled={isDisabled}
        />
      )}
      <Args
        variantId={variantId}
        objInfoId={sweep.selectedItem}
        paramSweep={sweep.params}
        forSectionId={forSectionId}
        sectionId={sectionId}
        selectedItemIdx={selectedItemIdx}
        alreadySelected={alreadySelected}
        showParamSweepSectionSearch={showParamSweepSectionSearch}
        isDisabled={isDisabled}
      />
    </div>
  );
}

function Args({
  variantId,
  objInfoId,
  paramSweep,
  forSectionId,
  sectionId,
  selectedItemIdx,
  alreadySelected,
  showParamSweepSectionSearch,
  isDisabled,
}) {
  return (
    <section className="section-row-main nowheel section-w-full section-min-rows grid grid-cols-subgrid gap-y-1">
      {paramSweep.map((x, idx) => (
        <ArgItem
          key={`${selectedItemIdx}-${x.paramInfoId}-${idx}`}
          objInfoId={objInfoId}
          variantId={variantId}
          paramIdx={idx}
          singleParamSweep={x}
          alreadySelected={alreadySelected}
          forSectionId={forSectionId}
          sectionId={sectionId}
          selectedItemIdx={selectedItemIdx}
          showParamSweepSectionSearch={showParamSweepSectionSearch}
          isDisabled={isDisabled}
        />
      ))}
    </section>
  );
}

function ArgItem({
  objInfoId,
  variantId,
  paramIdx,
  singleParamSweep,
  alreadySelected,
  forSectionId,
  sectionId,
  selectedItemIdx,
  showParamSweepSectionSearch,
  isDisabled,
}) {
  const { paramInfoId, values } = singleParamSweep;

  function getOnChange(valueIdx) {
    return (v) =>
      setParamSweepValue({
        variantId,
        selectedItemIdx,
        paramIdx,
        valueIdx,
        value: _.toString(v),
      });
  }

  function getOnDelete(valueIdx) {
    return () =>
      deleteParamSweepValue({
        variantId,
        selectedItemIdx,
        paramIdx,
        valueIdx,
      });
  }

  function onPlus() {
    if (paramInfoId) {
      addParamSweepValue({ variantId, selectedItemIdx, paramIdx });
    }
  }

  function onMinus() {
    deleteLastParamSweepValue({ variantId, selectedItemIdx, paramIdx });
  }

  function onSelectedItemChange(v) {
    changeParamSweepParamInfoId({
      variantId,
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
          isDisabled={isDisabled}
        />

        <div className="flex items-center pl-0.5">
          <button
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
            onClick={onMinus}
            disabled={isDisabled}
          >
            <i className="gg-remove" />
          </button>
          <button
            className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
            onClick={onPlus}
            disabled={isDisabled}
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
            isDisabled={isDisabled}
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
  isDisabled,
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
      isDisabled={isDisabled}
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
  isDisabled,
}) {
  return (
    <div className="group contents">
      <button
        className="section-left-gutter ml-2 flex h-[0.66rem] w-[0.66rem] cursor-pointer items-center justify-center place-self-center bg-transparent text-transparent opacity-75 hover:!text-setta-600 group-hover:text-setta-300 dark:hover:!text-setta-200 group-hover:dark:text-setta-600"
        onClick={onDelete}
        tabIndex="-1"
        disabled={isDisabled}
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
          isDisabled={isDisabled}
        />
      </article>
    </div>
  );
}

function AddRemoveButtonsForNoCallableSection({
  forSectionId,
  variantId,
  paramSweep,
  isDisabled,
}) {
  const alreadySelected = paramSweep[0]?.params.map((x) => x.paramInfoId) ?? [];
  const selectedItemIdx = paramSweep.length > 0 ? 0 : null;

  const { onClickAddParam, disabled: disablePlusButton } = useOnClickAddParam({
    forSectionId,
    variantId,
    selectedItem: null,
    selectedItemIdx,
    alreadySelected,
  });

  const onClickRemoveParam = () =>
    deleteLastParamSweepParamInfoId({ variantId, selectedItemIdx });

  return (
    <div className="mb-0.5 flex rounded-lg bg-setta-100 py-1 pl-0.5 pr-0.5 dark:bg-setta-950">
      <p className="ml-1.5 mr-auto text-xs font-bold tracking-tighter text-setta-500 dark:text-setta-400">
        Add/Remove Parameters
      </p>
      <button
        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
        onClick={onClickRemoveParam}
        disabled={isDisabled}
      >
        <i className="gg-remove" />
      </button>
      <button
        className="flex h-4 w-4 cursor-pointer items-center justify-center rounded-full text-setta-300 
            hover:text-setta-600 dark:text-setta-700 dark:hover:text-setta-400 [&>*]:!absolute"
        onClick={onClickAddParam}
        disabled={disablePlusButton || isDisabled}
      >
        <i className="gg-add" />
      </button>
    </div>
  );
}

function useShowParamSweepSectionSearch(sectionId) {
  return useSectionInfos((x) => {
    return (
      !x.x[sectionId].hideSearch &&
      getSectionType(sectionId, x) !== C.GLOBAL_VARIABLES
    );
  });
}

function useNumChildlessParams(selectedItem, sectionId) {
  return useSectionInfos((x) => {
    const codeInfoChildren = getCodeInfoCol(sectionId, x).children;
    return getParamIds(sectionId, x.codeInfo, codeInfoChildren, selectedItem)[
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
  return useSectionInfos((x) => {
    // this is for the contents of the combobox
    // so I don't think it needs to depend on the displayed (preview) codeInfoCol
    const codeInfoChildren = getCodeInfoCol(forSectionId, x).children;
    const { ids, pathMap } = getParamIds(
      forSectionId,
      x.codeInfo,
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
      const paramFullPathName = paramNameFromPathArray(x.codeInfo, pathMap, f);
      output.push({ id: f, name: paramFullPathName });
    }
    return output;
  }, _.isEqual);
}

function useOnClickAddParam({
  forSectionId,
  variantId,
  selectedItem,
  selectedItemIdx,
  alreadySelected,
}) {
  function onClickAddParam() {
    addParamSweepParamInfoId({
      variantId,
      selectedItemIdx,
      paramInfoId: null,
    });
  }

  const numParams = useNumChildlessParams(selectedItem, forSectionId);

  return { onClickAddParam, disabled: alreadySelected.length >= numParams };
}
