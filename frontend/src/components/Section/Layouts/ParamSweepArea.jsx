import { ParamSweepUI } from "components/Params/ParamUIs/ParamUI";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
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

  return (
    <>
      <div className="section-main-full-w ml-1.5 flex flex-col gap-6 overflow-y-scroll">
        {paramSweep.map((sweep) => (
          <ParamSweepForOneSelectedItem
            key={sweep.selectedItem}
            section={sectionId}
            forSectionId={forSectionId}
            sweep={sweep}
            paramSweepId={paramSweepId}
          />
        ))}
        <button className="-mt-4 flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-solid border-setta-500 px-3 py-1.5 text-xs font-bold uppercase text-setta-700 hover:bg-setta-200  dark:text-setta-400 dark:hover:bg-setta-900">
          <i className="gg-play-list-add !scale-75" />
          <p>Callable</p>
        </button>
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
}) {
  const hideSearch = useSectionInfos((x) => x.x[forSectionId].hideSearch);
  const _isGlobalVariables =
    useSectionTypeName(forSectionId) === C.GLOBAL_VARIABLES;

  const codeInfoId = useGetSectionInfo(forSectionId, "codeInfoId");

  return (
    <div className="section-min-rows section-grid-cols section-grid-sweep-areas grid">
      {!hideSearch && !_isGlobalVariables && (
        <ParamSweepSectionSearch
          sectionId={sectionId}
          forSectionId={forSectionId}
          selectedItem={sweep.selectedItem}
          paramSweepId={paramSweepId}
        />
      )}
      {/* <FilterSection /> */}
      <Args
        paramSweepId={paramSweepId}
        objInfoId={sweep.selectedItem ?? codeInfoId}
        paramSweep={sweep.params}
        forSectionId={forSectionId}
        sectionId={sectionId}
      />
    </div>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";
  // bg-gradient-to-t from-setta-50
  return (
    <>
      <search className="section-args flex min-w-0 items-center rounded-xl border-b border-solid  border-white  px-3 pb-1 shadow-sm dark:border-setta-700">
        <StandardSearch
          leftElement={<i className="gg-sort-az !scale-75 text-setta-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
        />
      </search>
    </>
  );
}

function Args({
  paramSweepId,
  objInfoId,
  paramSweep,
  forSectionId,
  sectionId,
}) {
  const alreadySelected = paramSweep.map((x) => x.paramInfoId);

  return (
    <section className="section-row-main nowheel section-w-full section-min-rows grid grid-cols-subgrid gap-y-1 overflow-y-auto overflow-x-clip">
      {paramSweep.map((x, idx) => (
        <ArgItem
          key={idx}
          objInfoId={objInfoId}
          paramSweepId={paramSweepId}
          idx={idx}
          singleParamSweep={x}
          alreadySelected={alreadySelected}
          forSectionId={forSectionId}
          sectionId={sectionId}
        />
      ))}
      <PlaceholderArgItem
        paramSweepId={paramSweepId}
        objInfoId={objInfoId}
        alreadySelected={alreadySelected}
      />
    </section>
  );
}

function ArgItem({
  objInfoId,
  paramSweepId,
  idx,
  singleParamSweep,
  alreadySelected,
  forSectionId,
  sectionId,
  unused = false,
}) {
  const { paramInfoId, values } = singleParamSweep;

  function getOnChange(valueIdx) {
    return (v) =>
      setParamSweepValue({ paramSweepId, idx, valueIdx, value: _.toString(v) });
  }

  function getOnDelete(valueIdx) {
    return () => deleteParamSweepValue({ paramSweepId, idx, valueIdx });
  }

  function onPlus() {
    addParamSweepValue({ paramSweepId, idx });
  }

  function onMinus() {
    deleteLastParamSweepValue({ paramSweepId, idx });
  }

  function onSelectedItemChange(v) {
    changeParamSweepParamInfoId({ paramSweepId, idx, paramInfoId: v });
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
      {values.map((x, valueIdx) => (
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

function PlaceholderArgItem({ paramSweepId, objInfoId, alreadySelected }) {
  function onSelectedItemChange(v, changeByUser, setSelection) {
    addParamSweepParamInfoId({ paramSweepId, paramInfoId: v });
    setSelection(null);
  }

  const thereAreRemainingIds = useCodeInfo(
    (x) => alreadySelected.length < x.x[objInfoId].children.length,
  );

  return (
    thereAreRemainingIds && (
      <button className="section-w-full mt-1 flex cursor-pointer items-center justify-center  gap-0.5 rounded-xl bg-setta-200/30 px-3 py-1 text-xs font-bold uppercase text-setta-700 hover:bg-setta-200 dark:bg-setta-800/50 dark:text-setta-400 dark:hover:bg-setta-900">
        <i className="gg-add-r -ml-3" />
        <p>Param</p>
      </button>
      // <ParamCombobox
      //   objInfoId={objInfoId}
      //   paramInfoId={null}
      //   onSelectedItemChange={onSelectedItemChange}
      //   alreadySelected={alreadySelected}
      // />
    )
  );
}

function ParamCombobox({
  objInfoId,
  paramInfoId,
  alreadySelected = [],
  onSelectedItemChange,
}) {
  const initialSelection = paramInfoId;

  const objParams = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId].children) {
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
