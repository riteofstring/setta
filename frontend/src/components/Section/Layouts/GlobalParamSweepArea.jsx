import CodeMirror from "@uiw/react-codemirror";
import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { getExtensions } from "components/Utils/CodeMirror/getExtensions";
import { useCodeMirrorStyle } from "components/Utils/CodeMirror/useCodeMirrorStyle";
import C from "constants/constants.json";
import _ from "lodash";
import React, { useEffect, useState } from "react";
import { BiFilter } from "react-icons/bi";
import {
  createNewRunGroup,
  toggleRunGroup,
  toggleRunGroupParamSweep,
  toggleRunGroupSection,
} from "state/actions/runGroups/runGroups";
import { setSectionVariantAttr } from "state/actions/sectionVariants";
import { useRunGroups } from "state/definitions";
import { useGetOverviewListing } from "state/hooks/overview";
import { useGetParamSweepNames } from "state/hooks/paramSweep";
import { useGetSectionInfo } from "state/hooks/sections";
import { useGetSectionVariantNames } from "state/hooks/sectionVariants";
import { createNewId, createRandomName } from "utils/idNameCreation";

export function GlobalParamSweepArea({ sectionId }) {
  const showYaml = useGetSectionInfo(sectionId, "showYaml");
  return !showYaml ? (
    <GlobalParamSweepGUI />
  ) : (
    <GlobalParamSweepCode sectionId={sectionId} />
  );
}

function GlobalParamSweepCode({ sectionId }) {
  const code = useGetSectionInfo(sectionId, "code");
  const theme = useCodeMirrorStyle();
  const extensions = getExtensions({ sectionId, language: "python" });

  function onChange(v) {
    setSectionVariantAttr(sectionId, "code", v);
  }

  return (
    <article
      className={`nodrag nowheel section-full-no-title cursor-auto [&_*]:!outline-0`}
    >
      <CodeMirror
        value={code}
        onChange={onChange}
        theme={theme}
        extensions={extensions}
      />
    </article>
  );
}

function GlobalParamSweepGUI() {
  const runGroups = useRunGroups((x) => x.x);
  const firstRunGroupId = Object.keys(runGroups)[0];
  const [shownRunGroup, setShownRunGroup] = useState(firstRunGroupId);
  const [previewRunGroup, setPreviewRunGroup] = useState(null);
  const toShow = previewRunGroup ?? shownRunGroup;

  useEffect(() => {
    if (firstRunGroupId) {
      setShownRunGroup(firstRunGroupId);
    }
  }, [firstRunGroupId]);

  return (
    <>
      <section className="section-main mb-2 flex min-w-0 flex-col gap-6 overflow-y-scroll @sm/multipane:flex-row  @sm/multipane:overflow-visible">
        <article className="flex flex-col gap-2 ">
          <FilterSection />

          <RunGroupList
            runGroups={runGroups}
            setShownRunGroup={setShownRunGroup}
            setPreviewRunGroup={setPreviewRunGroup}
            shownRunGroup={shownRunGroup}
          />
          <CreateNewRunGroupButton setShownRunGroup={setShownRunGroup} />
        </article>
        {runGroups[toShow] && (
          <article className="flex flex-1 flex-col gap-2 overflow-x-hidden ">
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
    <ul className="noscroll nowheel flex flex-grow flex-col overflow-y-scroll">
      {Object.entries(runGroups).map(([id, x], idx) => (
        <CheckboxNextToLabel
          key={idx}
          shown={shownRunGroup === id}
          checked={x.selected}
          onChange={() => {
            toggleRunGroup(id);
          }}
          onClick={() => setShownRunGroup(id)}
          onMouseOver={() => setPreviewRunGroup(id)}
          onMouseLeave={() => setPreviewRunGroup(null)}
        >
          {x.name}
        </CheckboxNextToLabel>
      ))}
    </ul>
  );
}

function SectionList({ runGroupId, runGroup }) {
  const shownSectionTypes = [
    C.SECTION,
    C.LIST_ROOT,
    C.DICT_ROOT,
    C.DECK,
    C.GLOBAL_VARIABLES,
    C.CODE,
  ];
  const allSections = useGetOverviewListing((sectionTypeName) =>
    shownSectionTypes.includes(sectionTypeName),
  )[0];

  return (
    <ul className="noscroll nowheel -mt-2 flex flex-grow flex-col overflow-y-scroll rounded-lg bg-setta-50/40 px-3 pt-2 dark:bg-setta-875">
      {allSections.map((x, idx) => (
        <SectionItem
          key={idx}
          sectionInfo={x}
          runGroupId={runGroupId}
          runGroupSection={runGroup.sections[x.id]}
        />
      ))}
    </ul>
  );
}

function SectionItem({ sectionInfo, runGroupId, runGroupSection }) {
  function onSectionCheckboxChange() {
    toggleRunGroupSection({ id: runGroupId, sectionId: sectionInfo.id });
  }

  return (
    <div style={{ paddingLeft: `${0.75 * sectionInfo.depth}rem` }}>
      <li className="flex flex-col">
        <CheckboxGroup
          checked={!_.isNil(runGroupSection)}
          onChange={onSectionCheckboxChange}
        >
          {sectionInfo.name}
        </CheckboxGroup>
        <VersionsList
          sectionInfo={sectionInfo}
          runGroupId={runGroupId}
          runGroupSection={runGroupSection}
        />
        <ParamSweepVersionsList
          sectionInfo={sectionInfo}
          runGroupId={runGroupId}
          runGroupSection={runGroupSection}
        />
      </li>
    </div>
  );
}

function _VersionsList({ sectionInfo, runGroupId, runGroupSection }) {
  const allVersions = useGetSectionVariantNames(sectionInfo.id);

  function getOnParamSweepCheckboxChange(paramSweepId) {
    return () =>
      toggleRunGroupParamSweep({
        id: runGroupId,
        sectionId: sectionInfo.id,
        paramSweepId,
      });
  }

  function isChecked(id) {
    return !!runGroupSection?.[id];
  }

  return (
    <GenericList
      minLength={1}
      inputList={allVersions}
      listName="Versions"
      isChecked={isChecked}
      onChange={getOnParamSweepCheckboxChange}
    />
  );
}

const VersionsList = React.memo(_VersionsList, _.isEqual);

function _ParamSweepVersionsList({ sectionInfo, runGroupId, runGroupSection }) {
  const allParamSweeps = useGetParamSweepNames(sectionInfo.id);

  function getOnParamSweepCheckboxChange(paramSweepId) {
    return () =>
      toggleRunGroupParamSweep({
        id: runGroupId,
        sectionId: sectionInfo.id,
        paramSweepId,
      });
  }

  function isChecked(id) {
    return !!runGroupSection?.[id];
  }

  return (
    <GenericList
      minLength={0}
      inputList={allParamSweeps}
      listName="Param Sweeps"
      isChecked={isChecked}
      onChange={getOnParamSweepCheckboxChange}
    />
  );
}

const ParamSweepVersionsList = React.memo(_ParamSweepVersionsList, _.isEqual);

function _GenericList({ minLength, inputList, listName, isChecked, onChange }) {
  return (
    inputList.length > minLength && (
      <>
        <label className="text-setta-700 dark:text-setta-200">{listName}</label>
        <ul className="pl-4">
          {inputList.map((e, idx) => (
            <li
              key={idx}
              className="flex min-h-6 cursor-pointer items-center gap-2 truncate rounded"
            >
              <CheckboxGroup
                checked={isChecked(e.id)}
                onChange={onChange(e.id)}
              >
                {e.name}
              </CheckboxGroup>
            </li>
          ))}
        </ul>
      </>
    )
  );
}

const GenericList = React.memo(_GenericList, _.isEqual);

function CheckboxGroup({ children, checked, onChange }) {
  return (
    <label className="flex min-h-6 cursor-pointer items-center gap-2 text-xs text-setta-500 dark:text-setta-300">
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
  const font = shown ? "font-bold" : "";

  return (
    <li onMouseLeave={onMouseLeave}>
      <label
        className={`${font} flex min-h-6 cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-xs text-setta-700 dark:text-setta-200 `}
        onMouseOver={onMouseOver}
        onClick={onClick}
      >
        <input
          type="checkbox"
          className="h-4 w-4 min-w-4 cursor-pointer rounded-md bg-setta-500/10 checked:bg-blue-500 hover:bg-setta-500/30 hover:checked:bg-blue-500"
          checked={checked}
          onChange={onChange}
        />

        <p className="truncate">{children}</p>
      </label>
    </li>
  );
}

function FilterSection() {
  const inputStyles =
    "flex-1 min-w-0 text-xs outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-transparent truncate focus-visible:border-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700 ";

  return (
    <search className="flex min-w-0 items-center pb-1">
      <StandardSearch
        leftElement={<BiFilter className="text-setta-400" />}
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
    createNewRunGroup({ id, name: createRandomName() });
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
