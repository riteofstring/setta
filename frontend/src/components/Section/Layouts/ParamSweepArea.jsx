import { ParamSweepUI } from "components/Params/ParamUIs/ParamUI";
import { IconButton } from "components/Utils/atoms/buttons/IconButton";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { IdNameCombobox } from "components/Utils/Combobox/IdNameCombobox";
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
import { useCodeInfo, useSectionVariants } from "state/definitions";
import { useParamSweepInfo } from "state/hooks/paramSweep";
import { useMappedSectionDBSource } from "state/hooks/sections";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";
import { SectionSearch } from "../SectionParts/Search";

function _ParamSweepArea({ sectionId }) {
  const { paramSweepId, paramSweep, forSectionId, codeInfoId } =
    useParamSweepInfo(sectionId);

  return (
    <>
      <SectionSearch sectionId={sectionId} />
      <FilterSection />
      <Args
        paramSweepId={paramSweepId}
        objInfoId={codeInfoId}
        paramSweep={paramSweep}
        forSectionId={forSectionId}
        sectionId={sectionId}
      />
    </>
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

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
  const alreadySelected = paramSweep.map((x) => x.paramInfoId ?? x.variantId);

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
  sectionId,
  unused = false,
}) {
  const { paramInfoId, values, variantId } = singleParamSweep;

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
      changeParamSweepParamInfoId({ paramSweepId, idx, variantId: v });
    }
  }
  // <article className="nodrag nowheel section-key-value auto-rows-min grid grid-cols-subgrid py-1">

  return (
    <>
      <div className="section-key-value mt-1 flex min-w-0 items-center">
        <ParamCombobox
          objInfoId={objInfoId}
          paramInfoId={paramInfoId}
          variantId={variantId}
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
            sectionId={sectionId}
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

          <ShowSectionVariant
            forSectionId={forSectionId}
            objInfoId={objInfoId}
            variantId={variantId}
          />
        </div>
      )}
    </>
  );
}

function ShowSectionVariant({ forSectionId, objInfoId, variantId }) {
  const dbSource = useMappedSectionDBSource(forSectionId);
  const sectionVariant = useSectionVariants((x) => x.x[dbSource][variantId]);
  const paramsWithValues = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId].children) {
      if (sectionVariant.values[c]) {
        output.push({
          name: x.x[c].name,
          value: sectionVariant.values[c].value,
        });
      }
    }
    return output;
  }, _.isEqual);

  return paramsWithValues.map((x, idx) => (
    <SectionVariantItem key={idx} name={x.name} value={x.value} />
  ));
}

function SectionVariantItem({ name, value }) {
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
      addParamSweepParamInfoId({ paramSweepId, variantId: v });
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
  variantId,
  alreadySelected = [],
  onSelectedItemChange,
  forSectionId,
}) {
  const initialSelection = paramInfoId ?? variantId;

  const objParams = useCodeInfo((x) => {
    const output = [];
    for (const c of x.x[objInfoId].children) {
      if (c === paramInfoId || !alreadySelected.includes(c)) {
        output.push(x.x[c]);
      }
    }
    return output;
  }, _.isEqual);

  const sectionVariants = useGetSectionVariantNames(forSectionId).filter(
    (x) => variantId === x.id || !alreadySelected.includes(x.id),
  );

  return (
    <IdNameCombobox
      allItems={[
        { group: "Args", items: objParams },
        { group: "Versions", items: sectionVariants },
      ]}
      initialSelection={initialSelection}
      onSelectedItemChange={onSelectedItemChange}
      placeholder="Filter & Add Sweep"
      outerDivClasses="section-key-value justify-center not:last-child:mt-3"
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
          sectionId={forSectionId}
          paramInfoId={paramInfoId}
          value={value}
          onChange={onChange}
          className="nodrag"
          sectionIdToBeActive={sectionId}
          keywordPositions={[]}
          setKeywordPositions={() => {}}
        />
      </article>
    </>
  );
}
