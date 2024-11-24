import { YamlView } from "components/Params/YamlView";
import { StandardAccordion } from "components/Utils/atoms/accordion/accordion";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getSectionRect } from "forks/xyflow/core/utils/graph";
import _ from "lodash";
import React, { useEffect } from "react";
import { maybeRunGuiToYaml } from "state/actions/guiToYaml";
import {
  setPreviewRunGroup,
  setShownRunGroup,
} from "state/actions/project/projectConfig";
import {
  createRunGroupWithRandomName,
  toggleRunGroup,
  toggleRunGroupSection,
  toggleRunGroupSectionParamSweep,
  toggleRunGroupSectionVersion,
  useRunGroupListing,
  useTopLevelRunGroupListing,
} from "state/actions/runGroups/runGroups";
import {
  useProjectConfig,
  useRunGroups,
  useSectionInfos,
} from "state/definitions";
import { useGetParamSweepNames } from "state/hooks/paramSweep";
import { useIsScrollable } from "state/hooks/sectionSizes";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";
import { useShowYaml } from "./toYaml";

export function GlobalParamSweepArea({ sectionId }) {
  const width = useSectionInfos((x) => {
    const w = x.sectionConfigs[sectionId].size.width;
    return w === "auto" ? getSectionRect(sectionId)?.width : w;
  });

  return <GlobalParamSweepGUI sectionId={sectionId} width={width} />;
}

function GlobalParamSweepGUI({ sectionId, width }) {
  const firstRunGroupId = useRunGroups((x) => Object.keys(x.x)[0]);
  const { shownRunGroup, previewRunGroup } = useProjectConfig(
    (x) => _.pick(x, ["shownRunGroup", "previewRunGroup"]),
    _.isEqual,
  );
  const toShow = previewRunGroup ?? shownRunGroup;
  const { ref, isScrollable } = useIsScrollable();

  useEffect(() => {
    if (!shownRunGroup && firstRunGroupId) {
      setShownRunGroup(firstRunGroupId);
    }
  }, [shownRunGroup, firstRunGroupId]);

  useEffect(() => {
    maybeRunGuiToYaml(sectionId);
  }, [toShow]);

  return (
    <>
      <section
        className={`${width && width < 386 && isScrollable ? "nowheel" : ""} section-main mb-2 flex min-w-0 flex-col gap-6 overflow-y-scroll  @sm/multipane:flex-row  @sm/multipane:overflow-visible`}
        ref={ref}
      >
        <LeftSide shownRunGroup={shownRunGroup} />
        <RightSide sectionId={sectionId} toShow={toShow} />
      </section>
    </>
  );
}

function LeftSide({ shownRunGroup }) {
  return (
    <article className="mt-2 flex flex-col gap-2 ">
      <h3 className="ml-0.5 text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
        Run Groups
      </h3>

      <RunGroupList shownRunGroup={shownRunGroup} />
      <CreateNewRunGroupButton />
    </article>
  );
}

function RightSide({ sectionId, toShow }) {
  const showYaml = useShowYaml(sectionId);

  if (!toShow) {
    return null;
  }
  return (
    <article className="mt-2 flex flex-1 flex-col gap-2 @sm/multipane:overflow-x-hidden">
      {!showYaml ? (
        <>
          <h3 className="text-xs font-bold uppercase text-setta-300 dark:text-setta-500">
            Sections
          </h3>
          <FilterSection />
          <TopLevelSectionList runGroupId={toShow} />
        </>
      ) : (
        <YamlView sectionId={sectionId} />
      )}
    </article>
  );
}

function RunGroupList({ shownRunGroup }) {
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
  const { ref, isScrollable } = useIsScrollable();
  return (
    <SectionListCore
      sections={topLevelSections}
      runGroupId={runGroupId}
      ref={ref}
      className={isScrollable ? "nowheel" : ""}
      ancestors={[]}
      parentIsSelected={true}
    />
  );
}

function SectionList({ ancestors, parentIsSelected, runGroupId }) {
  const sections = useRunGroupListing(
    ancestors[ancestors.length - 1].variantId,
  );
  return (
    <SectionListCore
      sections={sections}
      runGroupId={runGroupId}
      ancestors={ancestors}
      parentIsSelected={parentIsSelected}
    />
  );
}

const SectionListCore = React.forwardRef(
  ({ sections, runGroupId, ancestors, parentIsSelected, className }, ref) => {
    return (
      sections.length > 0 && (
        <ul
          className={`${className} flex flex-grow flex-col overflow-visible rounded-lg bg-setta-50/40 pl-3 pr-2 pt-1 @sm/multipane:overflow-y-scroll dark:bg-setta-875`}
          ref={ref}
        >
          {sections.map((x, idx) => (
            <SectionItem
              key={idx}
              sectionInfo={x}
              ancestors={ancestors}
              parentIsSelected={parentIsSelected}
              runGroupId={runGroupId}
            />
          ))}
        </ul>
      )
    );
  },
);

function SectionItem({ sectionInfo, ancestors, parentIsSelected, runGroupId }) {
  const sectionId = sectionInfo.id;

  const parentVariantId =
    ancestors.length === 0 ? null : ancestors[ancestors.length - 1].variantId;

  function onSectionCheckboxChange() {
    toggleRunGroupSection({
      id: runGroupId,
      ancestors,
      sectionId,
      parentVariantId,
    });
  }

  const isSelected = useRunGroups((x) => {
    return (
      parentIsSelected &&
      !!x.x[runGroupId].sections[sectionId]?.[parentVariantId]?.selected
    );
  });

  return (
    <li className="flex flex-col">
      <CheckboxGroup checked={isSelected} onChange={onSectionCheckboxChange}>
        {sectionInfo.name}
      </CheckboxGroup>
      <MaybeVersionsList
        sectionId={sectionId}
        runGroupId={runGroupId}
        isSelected={isSelected}
        ancestors={ancestors}
        parentVariantId={parentVariantId}
      />
      <ParamSweepVersionsList
        sectionId={sectionId}
        runGroupId={runGroupId}
        isSelected={isSelected}
        ancestors={ancestors}
        parentVariantId={parentVariantId}
      />
    </li>
  );
}

function _MaybeVersionsList({
  sectionId,
  ancestors,
  runGroupId,
  isSelected,
  parentVariantId,
}) {
  const allVersions = useGetSectionVariantNames(sectionId);
  return allVersions.length > 1 ? (
    <VersionsList
      sectionId={sectionId}
      ancestors={ancestors}
      runGroupId={runGroupId}
      isSelected={isSelected}
      allVersions={allVersions}
      parentVariantId={parentVariantId}
    />
  ) : (
    <div className="pl-4">
      <SectionList
        ancestors={[
          ...ancestors,
          { id: sectionId, variantId: allVersions[0].id },
        ]}
        parentIsSelected={isSelected}
        runGroupId={runGroupId}
      />
    </div>
  );
}

const MaybeVersionsList = React.memo(_MaybeVersionsList, _.isEqual);

function VersionsList({
  sectionId,
  ancestors,
  runGroupId,
  isSelected,
  allVersions,
  parentVariantId,
}) {
  const atLeastOneVersionSelected = useRunGroups((x) => {
    const versionsObj =
      x.x[runGroupId].sections[sectionId]?.[parentVariantId]?.versions;
    if (!versionsObj) {
      return false;
    }
    for (const value of Object.values(versionsObj)) {
      if (value) return true;
    }
    return false;
  });

  const accordionRootStyles =
    atLeastOneVersionSelected || !isSelected
      ? undefined
      : "bg-red dark:bg-red-700/10 hover:border-red-50 dark:hover:border-red-700";

  return (
    <GenericList
      inputList={allVersions}
      heading={"Versions"}
      isSelected={isSelected}
      sectionId={sectionId}
      runGroupId={runGroupId}
      ancestors={ancestors}
      parentVariantId={parentVariantId}
      accordionRootStyles={accordionRootStyles}
      ChildComponent={VersionItemComponent}
    />
  );
}

function _ParamSweepVersionsList({
  sectionId,
  ancestors,
  runGroupId,
  isSelected,
  parentVariantId,
}) {
  const allParamSweeps = useGetParamSweepNames(sectionId);

  return (
    allParamSweeps.length > 0 && (
      <GenericList
        inputList={allParamSweeps}
        heading="Param Sweeps"
        isSelected={isSelected}
        sectionId={sectionId}
        runGroupId={runGroupId}
        ancestors={ancestors}
        parentVariantId={parentVariantId}
        ChildComponent={ParamSweepItemComponent}
      />
    )
  );
}

const ParamSweepVersionsList = React.memo(_ParamSweepVersionsList, _.isEqual);

function _GenericList({
  inputList,
  heading,
  isSelected,
  sectionId,
  runGroupId,
  ancestors,
  parentVariantId,
  accordionRootStyles,
  ChildComponent,
}) {
  return (
    <StandardAccordion
      rootStyles={`${accordionRootStyles ?? "hover:bg-white hover:dark:bg-setta-700/10 hover:border-setta-50 dark:hover:border-setta-700"} border border-transparent rounded-lg px-2 ml-8 -mr-2 -mt-0.5`}
      itemStyles="focus-within:relative focus-within:z-10"
      headerStyles="flex flex-1 cursor-default items-center justify-between my-0.5"
      triggerStyles="flex justify-between px-2 -mx-2 w-full items-center outline-none hover:cursor-pointer rounded-md italic text-xs font-semibold opacity-60 group-hover:opacity-100 text-setta-500 dark:text-setta-300"
      contentStyles="text-xs overflow-hidden mb-1"
      heading={heading}
      value={heading}
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
              ancestors={ancestors}
              parentVariantId={parentVariantId}
            />
          </li>
        ))}
      </ul>
    </StandardAccordion>
  );
}

const GenericList = React.memo(_GenericList, _.isEqual);

function VersionItemComponent({
  id,
  name,
  parentIsSelected,
  sectionId,
  runGroupId,
  ancestors,
  parentVariantId,
}) {
  function onChange() {
    toggleRunGroupSectionVersion({
      id: runGroupId,
      sectionId,
      versionId: id,
      ancestors,
      parentVariantId,
    });
  }

  const isSelected = useRunGroups(
    (x) =>
      parentIsSelected &&
      !!x.x[runGroupId].sections[sectionId]?.[parentVariantId].versions[id],
  );

  return (
    <>
      <div className="flex items-center gap-2 truncate">
        <CheckboxGroup checked={isSelected} onChange={onChange}>
          {name}
        </CheckboxGroup>
      </div>
      <div className="pl-4">
        <SectionList
          parentIsSelected={isSelected}
          ancestors={[...ancestors, { id: sectionId, variantId: id }]}
          runGroupId={runGroupId}
        />
      </div>
    </>
  );
}

function ParamSweepItemComponent({
  id,
  name,
  parentIsSelected,
  ancestors,
  sectionId,
  runGroupId,
  parentVariantId,
}) {
  function onChange() {
    toggleRunGroupSectionParamSweep({
      id: runGroupId,
      ancestors,
      sectionId,
      paramSweepId: id,
      parentVariantId,
    });
  }

  const isSelected = useRunGroups(
    (x) =>
      !!x.x[runGroupId].sections[sectionId]?.[parentVariantId].paramSweeps[id],
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

function CreateNewRunGroupButton({}) {
  return (
    <button
      className="nodrag flex min-w-0 cursor-pointer select-none items-center justify-center gap-1 rounded-md border border-solid border-setta-100 px-2 py-1 text-xs font-bold uppercase leading-none text-setta-400 outline-none transition-colors duration-150 hover:bg-setta-50 focus-visible:ring-2 dark:border-setta-800 dark:text-setta-500 dark:hover:bg-setta-800 dark:hover:text-setta-400"
      onClick={createRunGroupWithRandomName}
    >
      <i className="gg-add-r" /> New Run Group
    </button>
  );
}
