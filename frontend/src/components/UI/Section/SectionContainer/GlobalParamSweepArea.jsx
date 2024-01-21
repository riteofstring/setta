import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { useGetParamSweepNames } from "hooks/useParamSweepInfo";
import { useRunGroups } from "models/runGroups";
import { useState } from "react";
import { BiFilter } from "react-icons/bi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function GlobalParamSweepArea() {
  const runGroups = useRunGroups((x) => x.x);
  const [shownRunGroup, setShownRunGroup] = useState(
    "6a2056d0-214e-4d82-9c91-ee915069c7d4"
  );

  return (
    <>
      <section className="card-global-param-sweep flex min-w-0 flex-col overflow-y-scroll @sm/multipane:flex-row  @sm/multipane:overflow-visible">
        <article className="flex flex-col gap-2 ">
          <FilterSection />
          <RunGroupList
            runGroups={runGroups}
            setShownRunGroup={setShownRunGroup}
          />
        </article>
        <article className="flex flex-1 flex-col gap-2">
          <FilterSection />
          <SectionList
            runGroupId={shownRunGroup}
            runGroup={runGroups[shownRunGroup]}
          />
        </article>
      </section>
    </>
  );
}

function RunGroupList({ runGroups, setShownRunGroup }) {
  return (
    <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll pt-2">
      {Object.entries(runGroups).map(([id, x], idx) => (
        <CheckboxGroup
          key={idx}
          checked={x.selected}
          onChange={() => {
            useRunGroups.getState().toggleSelected(id);
          }}
          onMouseOver={() => setShownRunGroup(id)}
        >
          {x.name}
        </CheckboxGroup>
      ))}
    </div>
  );
}

function SectionList({ runGroupId, runGroup }) {
  const allSections = useGetOverviewListing()[0];

  return (
    <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll">
      {allSections.map((x, idx) => (
        <SectionItem
          key={idx}
          sectionInfo={x}
          runGroupId={runGroupId}
          runGroup={runGroup}
        />
      ))}
    </div>
  );
}

function SectionItem({ sectionInfo, runGroupId, runGroup }) {
  const variants =
    "-m-0 flex flex-col gap-2 rounded-lg p-2 hover:bg-runcoder-500/10";
  return (
    <div className={variants}>
      <ParamSweepVersionsList
        sectionInfo={sectionInfo}
        runGroupId={runGroupId}
        runGroup={runGroup}
      />
    </div>
  );
}

function ParamSweepVersionsList({ sectionInfo, runGroupId, runGroup }) {
  const variants = "text-xs text-runcoder-500 dark:text-runcoder-300";
  const allParamSweeps = useGetParamSweepNames(sectionInfo.id);

  function onSectionCheckboxChange() {
    useRunGroups
      .getState()
      .toggleSection({ id: runGroupId, sectionId: sectionInfo.id });
  }

  function getOnParamSweepCheckboxChange(paramSweepId) {
    return () =>
      useRunGroups.getState().toggleParamSweep({
        id: runGroupId,
        sectionId: sectionInfo.id,
        paramSweepId,
      });
  }

  return (
    <ul className="">
      <li>
        <CheckboxGroup
          checked={sectionInfo.id in runGroup.sections}
          onChange={onSectionCheckboxChange}
        >
          {sectionInfo.name}
        </CheckboxGroup>
        <ul className="pl-4">
          {allParamSweeps.map((e, idx) => (
            <li key={idx} className={variants}>
              <CheckboxGroup
                checked={!!runGroup.sections[sectionInfo.id]?.[e.id]}
                onChange={getOnParamSweepCheckboxChange(e.id)}
              >
                {e.name}
              </CheckboxGroup>
            </li>
          ))}
        </ul>
      </li>
    </ul>
  );
}

function CheckboxGroup({ children, checked, onChange, onMouseOver }) {
  return (
    <label
      className="dark:text-rx-300 flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200 dark:hover:bg-runcoder-700"
      onMouseOver={onMouseOver}
    >
      <input
        type="checkbox"
        className="h-4 w-4 rounded-md bg-runcoder-500/10 checked:bg-blue-500 hover:bg-runcoder-500/30 hover:checked:bg-blue-500"
        checked={checked}
        onChange={onChange}
      />
      {children}
    </label>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-7 py-1";

  return (
    <search className="flex min-w-0 items-center pb-1">
      <StandardSearch
        leftElement={<BiFilter className="text-runcoder-400" />}
        placeholder="Filter"
        inputStyles={inputStyles}
        outerClasses="flex-1"
      />
    </search>
  );
}
