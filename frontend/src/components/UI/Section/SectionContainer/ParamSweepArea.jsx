import React from "react";
import { AiOutlineMinus, AiOutlinePlus } from "react-icons/ai";
import { BiFilter } from "react-icons/bi";
import { IconButton } from "utils/atoms/buttons/IconButton";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

function _ParamSweepArea({ sectionId }) {
  return (
    <>
      <FilterSection />
      <Args />
      {/* <section className="card-fullsize">Param Sweep Area</section> */}
    </>
  );
}

export const ParamSweepArea = React.memo(_ParamSweepArea);

function FilterSection() {
  const inputStyles =
    "flex-1 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent focus-visible:border-blue-300 pl-7 py-1";

  return (
    <>
      <section className="card-args-control flex items-center rounded-xl border-b border-solid  border-white bg-gradient-to-t from-runcoder-50 px-6 pb-1 shadow-sm dark:border-runcoder-700 dark:from-transparent">
        <StandardSearch
          leftElement={<BiFilter className="text-runcoder-400" />}
          placeholder="Filter"
          inputStyles={inputStyles}
          outerClasses="flex-1"
        />
      </section>
    </>
  );
}

function Args() {
  return (
    <article className="nodrag nowheel card-args-list overflow-y-scroll py-1">
      <Item name="n_samples" />
      <Item name="shuffle" />
    </article>
  );
}

function Item({ name }) {
  return (
    <>
      <header className="col-start-3 col-end-5 mt-4 flex items-center">
        <h2 className="font-heading text-xs font-bold uppercase text-runcoder-600/70 dark:text-runcoder-400/70">
          {name}
        </h2>
        <div className="ml-auto flex">
          <IconButton icon={<AiOutlineMinus />} type="minus" />
          <IconButton icon={<AiOutlinePlus />} type="add" />
        </div>
      </header>
      <Input />
      <Input />
      <Input />
      <Input />
    </>
  );
}

function Input() {
  return (
    <article className="card-paramsweep-item -mx-2 -my-1 items-center justify-between rounded-lg py-1 px-2 hover:bg-runcoder-200/20 dark:hover:bg-runcoder-700/25">
      <input className="nodrag font-code h-[calc(1.25rem-2px)] flex-1 cursor-auto border-0 border-b border-solid border-runcoder-300 font-mono text-xs focus-visible:border-blue-400 dark:border-runcoder-600 dark:text-runcoder-300 dark:focus-visible:border-blue-400" />
    </article>
  );
}
