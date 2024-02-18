import { useGetOverviewListing } from "hooks/useGetOverviewListing";
import { useGetParamSweepNames } from "hooks/useParamSweepInfo";
import _ from "lodash";
import { useRunGroups } from "models/runGroups";
import React, { useState } from "react";
import { BiFilter } from "react-icons/bi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import {
  CODE,
  DECK,
  DICT_ROOT,
  GLOBAL_VARIABLES,
  LIST_ROOT,
  SCRIPT,
  SECTION,
} from "z_utils/constants";
import { createNewId, createRandomName } from "z_utils/utils";

export function GlobalParamSweepArea() {
  const runGroups = useRunGroups((x) => x.x);
  const [shownRunGroup, setShownRunGroup] = useState(Object.keys(runGroups)[0]);
  const [previewRunGroup, setPreviewRunGroup] = useState(null);
  const toShow = previewRunGroup ?? shownRunGroup;

  return (
    <>
      <section className="card-global-param-sweep flex min-w-0 flex-col overflow-y-scroll @sm/multipane:flex-row  @sm/multipane:overflow-visible">
        <article className="flex flex-col gap-2 ">
          <FilterSection />
          <CreateNewRunGroupButton setShownRunGroup={setShownRunGroup} />
          <RunGroupList
            runGroups={runGroups}
            setShownRunGroup={setShownRunGroup}
            setPreviewRunGroup={setPreviewRunGroup}
            shownRunGroup={shownRunGroup}
          />
        </article>
        {runGroups[toShow] && (
          <article className="flex flex-1 flex-col gap-2">
            <FilterSection />
            <SectionList runGroupId={toShow} runGroup={runGroups[toShow]} />
          </article>
        )}
      </section>
    </>
  );
}

function RunGroupList({
  runGroups,
  shownRunGroup,
  setShownRunGroup,
  setPreviewRunGroup,
}) {
  return (
    <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll pt-2">
      {Object.entries(runGroups).map(([id, x], idx) => (
        <CheckboxNextToLabel
          key={idx}
          shown={shownRunGroup === id}
          checked={x.selected}
          onChange={() => {
            useRunGroups.getState().toggleSelected(id);
          }}
          onClick={() => setShownRunGroup(id)}
          onMouseOver={() => setPreviewRunGroup(id)}
          onMouseLeave={() => setPreviewRunGroup(null)}
        >
          {x.name}
        </CheckboxNextToLabel>
      ))}
    </div>
  );
}

function SectionList({ runGroupId, runGroup }) {
  const shownSectionTypes = [
    SECTION,
    LIST_ROOT,
    DICT_ROOT,
    DECK,
    GLOBAL_VARIABLES,
    SCRIPT,
    CODE,
  ];
  const allSections = useGetOverviewListing((sectionTypeName) =>
    shownSectionTypes.includes(sectionTypeName),
  )[0];

  return (
    <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll">
      {allSections.map((x, idx) => (
        <SectionItem
          key={idx}
          sectionInfo={x}
          runGroupId={runGroupId}
          runGroupSection={runGroup.sections[x.id]}
        />
      ))}
    </div>
  );
}

function SectionItem({ sectionInfo, runGroupId, runGroupSection }) {
  const variants =
    "-m-0 flex flex-col gap-2 rounded-lg p-2 hover:bg-runcoder-500/10";
  return (
    <div className={variants}>
      <ParamSweepVersionsList
        sectionInfo={sectionInfo}
        runGroupId={runGroupId}
        runGroupSection={runGroupSection}
      />
    </div>
  );
}

function _ParamSweepVersionsList({ sectionInfo, runGroupId, runGroupSection }) {
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
          checked={!_.isNil(runGroupSection)}
          onChange={onSectionCheckboxChange}
        >
          {sectionInfo.name}
        </CheckboxGroup>
        <ul className="pl-4">
          {allParamSweeps.map((e, idx) => (
            <li key={idx} className={variants}>
              <CheckboxGroup
                checked={!!runGroupSection?.[e.id]}
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

const ParamSweepVersionsList = React.memo(_ParamSweepVersionsList, _.isEqual);

function CheckboxGroup({ children, checked, onChange }) {
  return (
    <label className="dark:text-rx-300 flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200 dark:hover:bg-runcoder-700">
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

function CheckboxNextToLabel({
  children,
  checked,
  shown,
  onChange,
  onClick,
  onMouseOver,
  onMouseLeave,
}) {
  const font = shown ? "font-bold" : "";

  return (
    <div className="flex items-center" onMouseLeave={onMouseLeave}>
      <input
        type="checkbox"
        className="h-4 w-4 rounded-md bg-runcoder-500/10 checked:bg-blue-500 hover:bg-runcoder-500/30 hover:checked:bg-blue-500"
        checked={checked}
        onChange={onChange}
      />
      <label
        className={`${font} dark:text-rx-300 flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200 dark:hover:bg-runcoder-700`}
        onMouseOver={onMouseOver}
        onClick={onClick}
      >
        {children}
      </label>
    </div>
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

function CreateNewRunGroupButton({ setShownRunGroup }) {
  function onClick() {
    const id = createNewId();
    useRunGroups.getState().newRunGroup({ id, name: createRandomName() });
    setShownRunGroup(id);
  }

  return (
    <button className="text-xs text-white" onClick={onClick}>
      New Run Group
    </button>
  );
}
