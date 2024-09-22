import { ParamSweepUI } from "components/Params/ParamUIs/ParamUI";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
import C from "constants/constants.json";
import _ from "lodash";
import React from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { IoClose } from "react-icons/io5";
import {
  addParamSweepParamInfoId,
  addParamSweepValue,
  changeParamSweepParamInfoId,
  deleteLastParamSweepValue,
  deleteParamSweepValue,
  setParamSweepValue,
} from "state/actions/runGroups/paramSweep";
import { useCodeInfo, useSectionInfos } from "state/definitions";
import { useParamSweepInfo } from "state/hooks/paramSweep";
import { useGetSectionInfo } from "state/hooks/sections";
import { useSectionTypeName } from "state/hooks/uiTypes";
import { ParamSweepSectionSearch } from "../SectionParts/Search";

function _ParamSweepArea({ sectionId }) {
  const { paramSweepId, paramSweep, forSectionId } =
    useParamSweepInfo(sectionId);

  const showParamSweepSectionSearch =
    useShowParamSweepSectionSearch(forSectionId);

  return (
    <>
      <div className="section-main-full-w ml-1.5 flex flex-col gap-6 overflow-y-scroll">
        {paramSweep.map((sweep, idx) => (
          <ParamSweepForOneSelectedItem
            key={sweep.selectedItem}
            sectionId={sectionId}
            forSectionId={forSectionId}
            sweep={sweep}
            paramSweepId={paramSweepId}
            selectedItemIdx={idx}
            showParamSweepSectionSearch={showParamSweepSectionSearch}
          />
        ))}
        {showParamSweepSectionSearch && (
          <button className="-mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-setta-200  dark:text-setta-400 dark:hover:bg-setta-900">
            <i className="gg-play-list-add !scale-75" />
            <p>Callable</p>
          </button>
        )}
      </div>
    </>
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

function ParamSweepForOneSelectedItem({
  sectionId,
  forSectionId,
  sweep,
  paramSweepId,
  selectedItemIdx,
  showParamSweepSectionSearch,
}) {
  return (
    <div className="section-min-rows section-grid-cols section-grid-sweep-areas grid">
      {showParamSweepSectionSearch && (
        <ParamSweepSectionSearch
          sectionId={sectionId}
          forSectionId={forSectionId}
          selectedItem={sweep.selectedItem}
          paramSweepId={paramSweepId}
          selectedItemIdx={selectedItemIdx}
        />
      )}
      <Args
        paramSweepId={paramSweepId}
        objInfoId={sweep.selectedItem}
        paramSweep={sweep.params}
        forSectionId={forSectionId}
        sectionId={sectionId}
        selectedItemIdx={selectedItemIdx}
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
}) {
  const alreadySelected = paramSweep.map((x) => x.paramInfoId);

  return (
    <section className="section-row-main nowheel section-w-full section-min-rows grid grid-cols-subgrid gap-y-1 overflow-y-auto overflow-x-clip">
      {paramSweep.map((x, idx) => (
        <ArgItem
          key={idx}
          objInfoId={objInfoId}
          paramSweepId={paramSweepId}
          paramIdx={idx}
          singleParamSweep={x}
          alreadySelected={alreadySelected}
          forSectionId={forSectionId}
          sectionId={sectionId}
          selectedItemIdx={selectedItemIdx}
        />
      ))}
      <PlaceholderArgItem
        forSectionId={forSectionId}
        paramSweepId={paramSweepId}
        objInfoId={objInfoId}
        alreadySelected={alreadySelected}
        selectedItemIdx={selectedItemIdx}
      />
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
    addParamSweepValue({ paramSweepId, selectedItemIdx, paramIdx });
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
        />

        <div className="ml-auto flex pl-2">
          <IconButton
            icon={<AiOutlineMinus />}
            type="minus"
            onClick={onMinus}
          />
          <IconButton icon={<AiOutlinePlus />} type="add" onClick={onPlus} />
        </div>
      </div>
      {paramInfoId &&
        values.map((x, valueIdx) => (
          <Input
            forSectionId={forSectionId}
            paramInfoId={paramInfoId}
            key={valueIdx}
            onChange={getOnChange(valueIdx)}
            onDelete={getOnDelete(valueIdx)}
            value={x}
            sectionId={sectionId}
          />
        ))}
    </>
  );
}

function PlaceholderArgItem({
  forSectionId,
  paramSweepId,
  objInfoId,
  alreadySelected,
  selectedItemIdx,
}) {
  const codeInfoId = useGetSectionInfo(forSectionId, "codeInfoId");

  function onButtonClick() {
    addParamSweepParamInfoId({
      paramSweepId,
      selectedItemIdx,
      paramInfoId: null,
    });
  }

  const thereAreRemainingIds = useCodeInfo(
    (x) =>
      alreadySelected.length < x.x[objInfoId ?? codeInfoId].children.length,
  );

  if (!thereAreRemainingIds) {
    return null;
  }
  return (
    <button
      className="section-w-full mt-1 flex cursor-pointer items-center justify-center  gap-0.5 rounded-xl bg-setta-200/30 px-3 py-1 text-xs font-bold uppercase text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900"
      onClick={onButtonClick}
    >
      <i className="gg-add-r -ml-3" />
      <p>Param</p>
    </button>
  );
}

function ParamCombobox({
  objInfoId,
  paramInfoId,
  alreadySelected = [],
  onSelectedItemChange,
  forSectionId,
}) {
  const initialSelection = paramInfoId;
  const codeInfoId = useGetSectionInfo(forSectionId, "codeInfoId");

  const objParams = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId ?? codeInfoId].children) {
      if (c === paramInfoId || !alreadySelected.includes(c)) {
        output.push(x.x[c]);
      }
    }
    return output;
  }, _.isEqual);

  return (
    <IdNameCombobox
      allItems={[{ group: "Args", items: objParams }]}
      initialSelection={initialSelection}
      onSelectedItemChange={onSelectedItemChange}
      placeholder="Filter & Add Sweep"
      outerDivClasses="section-w-full justify-center not:last-child:mt-3"
      small={true}
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
    <>
      <IconButton
        icon={<IoClose />}
        bg="bg-transparent"
        color="text-setta-100 dark:text-setta-700 hover:text-setta-500 dark:hover:text-setta-200"
        twClasses="opacity-75 ml-2 section-left-gutter cursor-pointer place-self-center"
        padding=""
        size="h-[.66rem] w-[.66rem]"
        onClick={onDelete}
        tabIndex="-1"
      />
      <article className="section-key-value group/arg-group group/textinput -mx-2 grid grid-cols-subgrid items-center justify-between rounded-lg px-2">
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
    </>
  );
}

function useShowParamSweepSectionSearch(sectionId) {
  const hideSearch = useSectionInfos((x) => x.x[sectionId].hideSearch);
  const _isGlobalVariables =
    useSectionTypeName(sectionId) === C.GLOBAL_VARIABLES;

  return !hideSearch && !_isGlobalVariables;
}
