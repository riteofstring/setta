import { useRunGroups } from "models/runGroups";
import { BiFilter } from "react-icons/bi";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function GlobalParamSweepArea({ sectionId }) {
  const mr1 = [{ dataset: ["dataset sweep 1", "dataset sweep 2"] }];

  const mr2 = [{ algorithm: ["param sweep version 1"] }];
  return (
    <>
      <section className="card-global-param-sweep flex min-w-0 flex-col overflow-y-scroll @sm/multipane:flex-row  @sm/multipane:overflow-visible">
        <article className="flex flex-col gap-2 ">
          <FilterSection />
          <RunGroupList sectionId={sectionId} />
        </article>
        <article className="flex flex-1 flex-col gap-2">
          <FilterSection />
          <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll">
            <ParamListGroup multiruns={mr1} />
            <ParamListGroup multiruns={mr2} />
          </div>
        </article>
      </section>
    </>
  );
}

function RunGroupList({ sectionId }) {
  const runGroups = useRunGroups((x) => x.x);

  return (
    <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll pt-2">
      {Object.entries(runGroups).map(([id, x], idx) => (
        <CheckboxGroup
          key={idx}
          checked={x.selected}
          onChange={() => {
            useRunGroups
              .getState()
              .setSelected({ id: id, selected: !x.selected });
          }}
        >
          {x.name}
        </CheckboxGroup>
      ))}
    </div>
  );
}

function ParamListGroup({ multiruns, searchOnly = false }) {
  const variants =
    "-m-0 flex flex-col gap-2 rounded-lg p-2 hover:bg-runcoder-500/10";
  return (
    <div className={variants}>
      <ParamSweepVersionsList multiruns={multiruns} />
    </div>
  );
}

function ParamSweepVersionsList({ multiruns }) {
  const variants = "text-xs text-runcoder-500 dark:text-runcoder-300";
  if (multiruns) {
    return (
      <ul className="">
        {multiruns.map((x) => {
          const key = Object.keys(x)[0];
          const values = x[key];
          return (
            <li key={key}>
              <CheckboxGroup>{key}</CheckboxGroup>
              <ul className="pl-4">
                {values.map((e) => (
                  <li key={e} className={variants}>
                    <CheckboxGroup>{e}</CheckboxGroup>
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    );
  }
  return null;
}

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
