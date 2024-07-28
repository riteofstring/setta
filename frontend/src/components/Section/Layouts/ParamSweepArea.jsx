import _ from "lodash";
import React from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { BiFilter } from "react-icons/bi";
import { IoClose } from "react-icons/io5";
import {
  addParamSweepParamInfoId,
  addParamSweepValue,
  changeParamSweepParamInfoId,
  deleteLastParamSweepValue,
  deleteParamSweepValue,
  setParamSweepValue,
} from "state/actions/runGroups/paramSweep";
import { useCodeInfo, useEVCols } from "state/definitions";
import { useGetEVColNames } from "state/hooks/ev";
import { useParamSweepInfo } from "state/hooks/paramSweep";
import { useMappedSectionDBSource } from "state/hooks/sections";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { ParamSweepUI } from "../../Params/ParamUIs/ParamUI";

function _ParamSweepArea({ sectionId }) {
  const { paramSweepId, paramSweep, forSectionId, codeInfoId } =
    useParamSweepInfo(sectionId);

  return (
    <>
      <FilterSection />
      <Args
        paramSweepId={paramSweepId}
        objInfoId={codeInfoId}
        paramSweep={paramSweep}
        forSectionId={forSectionId}
      />
    </>
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-7 py-1";
  // bg-gradient-to-t from-setta-50
  return (
    <>
      <search className="section-args flex min-w-0 items-center rounded-xl border-b border-solid  border-white  px-2 pb-1 shadow-sm dark:border-setta-700 dark:from-transparent">
        <StandardSearch
          leftElement={<BiFilter className="text-setta-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
        />
      </search>
    </>
  );
}

function Args({ paramSweepId, objInfoId, paramSweep, forSectionId }) {
  const alreadySelected = paramSweep.map((x) => x.paramInfoId ?? x.evColId);

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
        />
      ))}
      <PlaceholderArgItem
        paramSweepId={paramSweepId}
        objInfoId={objInfoId}
        alreadySelected={alreadySelected}
        forSectionId={forSectionId}
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
  unused = false,
}) {
  const { paramInfoId, values, evColId } = singleParamSweep;

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
    if (v in useCodeInfo.getState().x) {
      changeParamSweepParamInfoId({ paramSweepId, idx, paramInfoId: v });
    } else {
      changeParamSweepParamInfoId({ paramSweepId, idx, evColId: v });
    }
  }
  // <article className="nodrag nowheel section-key-value auto-rows-min grid grid-cols-subgrid py-1">

  return (
    <>
      <div className="section-key-value flex min-w-0 items-center py-1">
        <ParamCombobox
          objInfoId={objInfoId}
          paramInfoId={paramInfoId}
          evColId={evColId}
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

      {paramInfoId ? (
        values.map((x, valueIdx) => (
          <Input
            forSectionId={forSectionId}
            paramInfoId={paramInfoId}
            key={valueIdx}
            onChange={getOnChange(valueIdx)}
            onDelete={getOnDelete(valueIdx)}
            value={x}
          />
        ))
      ) : (
        <div className="section-key-value min-h-auto grid grid-cols-2 flex-col gap-x-4 rounded-lg bg-setta-100 px-4 py-3 dark:bg-setta-850">
          <p className="col-start-1 text-xs font-bold text-setta-300 dark:text-setta-600">
            Name
          </p>
          <p className="col-start-2 text-xs font-bold text-setta-300 dark:text-setta-600">
            Value
          </p>

          <ShowEVCol
            forSectionId={forSectionId}
            objInfoId={objInfoId}
            evColId={evColId}
          />
        </div>
      )}
    </>
  );
}

function ShowEVCol({ forSectionId, objInfoId, evColId }) {
  const dbSource = useMappedSectionDBSource(forSectionId);
  const evCol = useEVCols((x) => x.x[dbSource][evColId]);
  const paramsWithValues = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId].children) {
      if (evCol.values[c]) {
        output.push({ name: x.x[c].name, value: evCol.values[c] });
      }
    }
    return output;
  }, _.isEqual);

  return paramsWithValues.map((x, idx) => (
    <EVColItem key={idx} name={x.name} value={x.value} />
  ));
}

function EVColItem({ name, value }) {
  // TODO: show value next to name, like
  // name value
  return (
    <dl className="col-span-2 grid grid-cols-subgrid font-mono text-xs text-setta-500 dark:text-setta-200">
      <dt className="col-start-1 truncate">{name}</dt>
      <dd className="col-start-2 truncate">{value}</dd>
    </dl>
  );
}

function PlaceholderArgItem({
  paramSweepId,
  objInfoId,
  alreadySelected,
  forSectionId,
}) {
  function onSelectedItemChange(v, changeByUser, setSelection) {
    if (v in useCodeInfo.getState().x) {
      addParamSweepParamInfoId({ paramSweepId, paramInfoId: v });
    } else {
      addParamSweepParamInfoId({ paramSweepId, evColId: v });
    }

    setSelection(null);
  }

  return (
    <ParamCombobox
      objInfoId={objInfoId}
      paramInfoId={null}
      onSelectedItemChange={onSelectedItemChange}
      alreadySelected={alreadySelected}
      forSectionId={forSectionId}
    />
  );
}

function ParamCombobox({
  objInfoId,
  paramInfoId,
  evColId,
  alreadySelected = [],
  onSelectedItemChange,
  forSectionId,
}) {
  const initialSelection = paramInfoId ?? evColId;

  const objParams = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId].children) {
      if (c === paramInfoId || !alreadySelected.includes(c)) {
        output.push(x.x[c]);
      }
    }
    return output;
  }, _.isEqual);

  const evCols = useGetEVColNames(forSectionId).filter(
    (x) => evColId === x.id || !alreadySelected.includes(x.id),
  );

  return (
    <IdNameCombobox
      allItems={[
        { group: "Args", items: objParams },
        { group: "Versions", items: evCols },
      ]}
      initialSelection={initialSelection}
      onSelectedItemChange={onSelectedItemChange}
      placeholder="Filter & Add Sweep"
      outerDivClasses="section-key-value justify-center"
      small={true}
    />
  );
}

function Input({ forSectionId, paramInfoId, onChange, onDelete, value }) {
  return (
    <>
      <IconButton
        icon={<IoClose />}
        bg="bg-transparent"
        color="text-setta-400 hover:text-setta-600 dark:hover:text-setta-200"
        twClasses="section-left-gutter place-self-center ml-1"
        padding=""
        size="h-[.66rem] w-[.66rem]"
        onClick={onDelete}
      />
      <article className="section-key-value group/arg-group group/textinput row rem] -mx-2 grid grid-cols-subgrid items-center justify-between rounded-lg px-2">
        <ParamSweepUI
          sectionId={forSectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          className="nodrag"
        />
      </article>
    </>
  );
}
