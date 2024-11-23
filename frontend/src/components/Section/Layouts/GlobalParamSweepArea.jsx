import { StandardAccordion } from "components/Utils/atoms/accordion/accordion";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { setShownRunGroup } from "state/actions/project/projectConfig";
import {
  initRunGroup,
  toggleRunGroup,
  toggleRunGroupSection,
  toggleRunGroupSectionParamSweep,
  toggleRunGroupSectionVersion,
} from "state/actions/runGroups/runGroups";
import {
  useProjectConfig,
  useRunGroups,
  useSectionInfos,
} from "state/definitions";
import {
  useRunGroupListing,
  useTopLevelRunGroupListing,
} from "state/hooks/overview";
import { useGetParamSweepNames } from "state/hooks/paramSweep";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";
import { createNewId, createRandomName } from "utils/idNameCreation";

export function GlobalParamSweepArea({ sectionId }) {
  const width = useSectionInfos((x) => {
    const w = x.x[sectionId].size.width;
    return w === "auto" ? getSectionRect(sectionId)?.width : w;
  });

  return <GlobalParamSweepGUI width={width} />;
}

function GlobalParamSweepGUI({ width }) {
  const firstRunGroupId = useRunGroups((x) => Object.keys(x.x)[0]);
  const shownRunGroup = useProjectConfig((x) => x.shownRunGroup);
  const [previewRunGroup, setPreviewRunGroup] = useState(null);
  const toShow = previewRunGroup ?? shownRunGroup;

  const { ref, isScrollable } = useIsScrollable();
  useEffect(() => {
    if (!shownRunGroup && firstRunGroupId) {
      setShownRunGroup(firstRunGroupId);
    }
  }, [shownRunGroup, firstRunGroupId]);

  return (
    <>
      <section
        className={`${width && width < 386 && isScrollable ? "nowheel" : ""} section-main mb-2 flex min-w-0 flex-col gap-6 overflow-y-scroll  @sm/multipane:flex-row  @sm/multipane:overflow-visible`}
        ref={ref}
      >
        <article className="mt-2 flex flex-col gap-2 ">
          <h3 className="ml-0.5 text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
            Run Groups
          </h3>
          {/* <FilterSection /> */}

          <RunGroupList
            setShownRunGroup={setShownRunGroup}
            setPreviewRunGroup={setPreviewRunGroup}
            shownRunGroup={shownRunGroup}
          />
          <CreateNewRunGroupButton setShownRunGroup={setShownRunGroup} />
        </article>
        {!!toShow && (
          <article className="mt-2 flex flex-1 flex-col gap-2 @sm/multipane:overflow-x-hidden">
            <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
              Sections
            </h3>
            <FilterSection />
            <TopLevelSectionList runGroupId={toShow} />
          </article>
        )}
      </section>
    </>
  );
}

function RunGroupList({ shownRunGroup, setShownRunGroup, setPreviewRunGroup }) {
  const runGroupSelection = useProjectConfig(
    (x) => x.runGroupSelection,
    _.isEqual,
  );
  const { ref, isScrollable } = useIsScrollable();
  const runGroupsDetails = useRunGroups((x) => {
    const output = [];
    for (const [id, details] of Object.entries(x.x)) {
      output.push({ id, name: details.name });
    }
    return output;
  }, _.isEqual);

  console.log("runGroupsDetails", runGroupsDetails);

  return (
    <ul
      className={`${isScrollable ? "nowheel" : ""} flex flex-grow flex-col overflow-visible @sm/multipane:overflow-y-scroll`}
      ref={ref}
    >
      {runGroupsDetails.map(({ id, name }) => (
        <CheckboxNextToLabel
          key={id}
          shown={shownRunGroup === id}
          checked={runGroupSelection[id]}
          onChange={() => {
            toggleRunGroup(id);
          }}
          onMouseOver={() => setPreviewRunGroup(id)}
          onMouseLeave={() => setPreviewRunGroup(null)}
          onClick={() => setShownRunGroup(id)}
        >
          {name}
        </CheckboxNextToLabel>
      ))}
    </ul>
  );
}

function TopLevelSectionList({ runGroupId }) {
  const topLevelSections = useTopLevelRunGroupListing();
  return (
    <SectionListCore sections={topLevelSections} runGroupId={runGroupId} />
  );
}

function SectionList({ variantId, runGroupId }) {
  const sections = useRunGroupListing(variantId);
  return <SectionListCore sections={sections} runGroupId={runGroupId} />;
}

function SectionListCore({ sections, runGroupId }) {
  //const { ref, isScrollable } = useIsScrollable();
  //${isScrollable ? "nowheel" : ""}
  return (
    <ul
      className={`-mt-2 flex flex-grow flex-col overflow-visible rounded-lg bg-setta-50/40 pl-3 pr-2 pt-2 @sm/multipane:overflow-y-scroll dark:bg-setta-875`}
      // ref={ref}
    >
      {sections.map((x, idx) => (
        <SectionItem key={idx} sectionInfo={x} runGroupId={runGroupId} />
      ))}
    </ul>
  );
}

function SectionItem({ sectionInfo, runGroupId }) {
  function onSectionCheckboxChange() {
    toggleRunGroupSection({ id: runGroupId, sectionId: sectionInfo.id });
  }

  const isSelected = useRunGroups(
    (x) => !!x.x[runGroupId].sections[sectionInfo.id]?.selected,
  );

  return (
    // <div style={{ paddingLeft: `${0.75 * sectionInfo.depth}rem` }}>
    <li className="flex flex-col">
      <CheckboxGroup checked={isSelected} onChange={onSectionCheckboxChange}>
        {sectionInfo.name}
      </CheckboxGroup>
      <VersionsList
        sectionInfo={sectionInfo}
        runGroupId={runGroupId}
        isSelected={isSelected}
      />
      <ParamSweepVersionsList
        sectionInfo={sectionInfo}
        runGroupId={runGroupId}
        isSelected={isSelected}
      />
    </li>
    // </div>
  );
}

function _VersionsList({ sectionInfo, runGroupId, isSelected }) {
  const allVersions = useGetSectionVariantNames(sectionInfo.id);

  return (
    <GenericList
      minLength={0}
      inputList={allVersions}
      listName="Versions"
      isSelected={isSelected}
      sectionId={sectionInfo.id}
      runGroupId={runGroupId}
      ChildComponent={VersionItemComponent}
    />
  );
}

const VersionsList = React.memo(_VersionsList, _.isEqual);

function _ParamSweepVersionsList({ sectionInfo, runGroupId, isSelected }) {
  const allParamSweeps = useGetParamSweepNames(sectionInfo.id);

  return (
    <GenericList
      minLength={0}
      inputList={allParamSweeps}
      listName="Param Sweeps"
      isSelected={isSelected}
      sectionId={sectionInfo.id}
      runGroupId={runGroupId}
      ChildComponent={ParamSweepItemComponent}
    />
  );
}

const ParamSweepVersionsList = React.memo(_ParamSweepVersionsList, _.isEqual);

function _GenericList({
  minLength,
  inputList,
  listName,
  isSelected,
  sectionId,
  runGroupId,
  ChildComponent,
}) {
  return (
    inputList.length > minLength && (
      <>
        <StandardAccordion
          rootStyles=" hover:bg-white hover:dark:bg-setta-700/10 border border-transparent hover:border-setta-50 dark:hover:border-setta-700  rounded-lg px-2 ml-8 -mr-2 -mt-0.5"
          itemStyles="focus-within:relative focus-within:z-10"
          headerStyles="flex flex-1 cursor-default items-center justify-between my-0.5"
          triggerStyles="flex justify-between px-2 -mx-2 w-full items-center outline-none hover:cursor-pointer rounded-md italic text-xs font-semibold opacity-60 group-hover:opacity-100 text-setta-500 dark:text-setta-300"
          contentStyles="text-xs overflow-hidden mb-1"
          heading={listName}
          value={listName}
          internalWrapper={false}
          // defaultValue={defaultValue}
          data-state={open}
        >
          <ul className="">
            {inputList.map((e, idx) => (
              <li
                key={idx}
                className="flex min-h-6 cursor-pointer flex-col rounded"
              >
                <ChildComponent
                  id={e.id}
                  name={e.name}
                  parentIsSelected={isSelected}
                  sectionId={sectionId}
                  runGroupId={runGroupId}
                />
              </li>
            ))}
          </ul>
        </StandardAccordion>
      </>
    )
  );
}

const GenericList = React.memo(_GenericList, _.isEqual);

function VersionItemComponent({
  id,
  name,
  parentIsSelected,
  sectionId,
  runGroupId,
}) {
  function onChange() {
    toggleRunGroupSectionVersion({
      id: runGroupId,
      sectionId,
      versionId: id,
    });
  }

  const isSelected = useRunGroups(
    (x) => !!x.x[runGroupId].sections[sectionId]?.versions[id],
  );

  return (
    <>
      <div className="flex items-center gap-2 truncate">
        <CheckboxGroup
          checked={parentIsSelected && isSelected}
          onChange={onChange}
        >
          {name}
        </CheckboxGroup>
      </div>
      <div className="pl-4">
        <SectionList variantId={id} runGroupId={runGroupId} />
      </div>
    </>
  );
}

function ParamSweepItemComponent({
  id,
  name,
  parentIsSelected,
  sectionId,
  runGroupId,
}) {
  function onChange() {
    toggleRunGroupSectionParamSweep({
      id: runGroupId,
      sectionId,
      paramSweepId: id,
    });
  }

  const isSelected = useRunGroups(
    (x) => !!x.x[runGroupId].sections[sectionId]?.paramSweeps[id],
  );

  return (
    <CheckboxGroup checked={parentIsSelected && isSelected} onChange={onChange}>
      {name}
    </CheckboxGroup>
  );
}

function CheckboxGroup({ children, checked, onChange }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-center gap-2 text-xs text-setta-700 dark:text-setta-300">
      <input
        type="checkbox"
        className="h-4 w-4 min-w-4 rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
        checked={checked}
        onChange={onChange}
      />
      <p className="truncate">{children}</p>
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
  return (
    <li
      className="group/runitem flex justify-between"
      onMouseOver={onMouseOver}
      onMouseLeave={onMouseLeave}
    >
      <label
        className={`flex min-h-6 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-setta-700 group-hover/runitem:!text-blue-500 dark:text-setta-200 ${shown ? "font-bold !text-blue-500" : ""}`}
      >
        <input
          type="checkbox"
          className="h-4 w-4 min-w-4 cursor-pointer rounded-md bg-setta-500/15 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
          checked={checked}
          onChange={onChange}
        />

        <p className="truncate">{children}</p>
      </label>
      <button
        className={`mr-0.5 cursor-pointer text-transparent hover:!text-setta-500 group-hover/runitem:text-setta-300 dark:hover:!text-setta-300 dark:group-hover/runitem:text-setta-600 ${shown ? "!text-blue-500" : ""}`}
        onClick={onClick}
      >
        <i className="gg-pen  " />
      </button>
    </li>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <search className="flex min-w-0 items-center pb-1">
      <StandardSearch
        leftElement={<i className="gg-sort-az !scale-75 text-setta-400" />}
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
    initRunGroup({ id, name: createRandomName() });
    setShownRunGroup(id);
  }

  return (
    <button
      className="nodrag flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-1 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400"
      onClick={onClick}
    >
      <i className="gg-add-r" /> New Run Group
    </button>
  );
}
