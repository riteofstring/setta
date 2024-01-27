import { useGetEVColNames } from "hooks/useEnteredValue";
import { useParamSweepInfo } from "hooks/useParamSweepInfo";
import _ from "lodash";
import { useCodeInfo } from "models/info/codeInfo";
import { useParamInfos } from "models/info/paramInfos";
import { useParamSweep } from "models/paramSweep";
import React from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { BiFilter } from "react-icons/bi";
import { IoClose } from "react-icons/io5";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

function _ParamSweepArea({ sectionId }) {
  const { paramSweepId, paramSweep, forSectionId } =
    useParamSweepInfo(sectionId);
  // const selectedItem = useGetSectionInfo(sectionId, "selectedItem");
  const selectedItem = "bb52a19f-d69c-4973-94ae-c1d85596cbb7";

  return (
    <>
      <FilterSection />
      <Args
        paramSweepId={paramSweepId}
        objInfoId={selectedItem}
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
  // bg-gradient-to-t from-runcoder-50
  return (
    <>
      <search className="card-args-control flex min-w-0 items-center rounded-xl border-b border-solid  border-white  px-6 pb-1 shadow-sm dark:border-runcoder-700 dark:from-transparent">
        <StandardSearch
          leftElement={<BiFilter className="text-runcoder-400" />}
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
    <section className="card-sweep-list overflow-y-auto overflow-x-clip">
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
      useParamSweep
        .getState()
        .setValue({ paramSweepId, idx, valueIdx, value: v });
  }

  function getOnDelete(valueIdx) {
    return () =>
      useParamSweep.getState().deleteValue({ paramSweepId, idx, valueIdx });
  }

  function onPlus() {
    useParamSweep.getState().addValue({ paramSweepId, idx });
  }

  function onMinus() {
    useParamSweep.getState().deleteLastValue({ paramSweepId, idx });
  }

  function onSelectedItemChange(v) {
    if (v in useCodeInfo.getState().x) {
      useParamSweep
        .getState()
        .changeParamInfoId({ paramSweepId, idx, paramInfoId: v });
    } else {
      useParamSweep
        .getState()
        .changeParamInfoId({ paramSweepId, idx, evColId: v });
    }
  }

  return (
    <article className="nodrag nowheel card-sweep-group  py-1">
      <div className="col-start-2 col-end-6 flex items-center">
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
            key={valueIdx}
            onChange={getOnChange(valueIdx)}
            onDelete={getOnDelete(valueIdx)}
            value={x}
          />
        ))
      ) : (
        <div className="col-start-2 col-end-6 grid grid-cols-2 flex-col rounded-lg bg-runcoder-850 px-4 py-3">
          <p className="col-start-1 text-xs font-bold text-runcoder-300 dark:text-runcoder-600">
            Name
          </p>
          <p className="col-start-2 text-xs font-bold text-runcoder-300 dark:text-runcoder-600">
            Value
          </p>

          <ShowEVCol objInfoId={objInfoId} evColId={evColId} />
        </div>
      )}
    </article>
  );
}

function ShowEVCol({ objInfoId, evColId }) {
  const evCol = useParamInfos((x) => x.x[evColId]);
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
    <dl className="col-span-2 grid grid-cols-subgrid font-mono text-xs text-runcoder-500 dark:text-runcoder-200">
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
      useParamSweep.getState().addParamInfoId({ paramSweepId, paramInfoId: v });
    } else {
      useParamSweep.getState().addParamInfoId({ paramSweepId, evColId: v });
    }

    setSelection(null);
  }

  return (
    <div className="col-start-2 col-end-6 flex items-center">
      <ParamCombobox
        objInfoId={objInfoId}
        paramInfoId={null}
        onSelectedItemChange={onSelectedItemChange}
        alreadySelected={alreadySelected}
        forSectionId={forSectionId}
      />
    </div>
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
    (x) => evColId === x.id || !alreadySelected.includes(x.id)
  );

  return (
    <IdNameCombobox
      allItems={[
        { group: "Args", items: objParams },
        { group: "Versions", items: evCols },
      ]}
      initialSelection={initialSelection}
      onSelectedItemChange={onSelectedItemChange}
    />
  );
}

function Input({ onChange, onDelete, value }) {
  return (
    <>
      <IconButton
        icon={<IoClose />}
        bg="bg-transparent"
        color="text-runcoder-400 hover:text-runcoder-600 dark:hover:text-runcoder-200"
        twClasses="card-close-arg-group place-self-center ml-1"
        padding=""
        size="h-[.66rem] w-[.66rem]"
        onClick={onDelete}
      />
      <article className="card-paramsweep-item -mx-2 -my-1 items-center justify-between rounded-lg px-2 py-1 hover:bg-runcoder-200/20 dark:hover:bg-runcoder-700/25">
        <input
          className="nodrag font-code h-[calc(1.25rem-2px)] flex-1 cursor-auto border-0 border-b border-solid border-runcoder-300 font-mono text-xs focus-visible:border-blue-400 dark:border-runcoder-600 dark:text-runcoder-300 dark:focus-visible:border-blue-400"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </article>
    </>
  );
}
