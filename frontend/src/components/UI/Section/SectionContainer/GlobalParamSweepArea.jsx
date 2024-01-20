import { BiFilter } from "react-icons/bi";
import { TbVersions } from "react-icons/tb";
import { Button } from "utils/atoms/buttons/Button";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function GlobalParamSweepArea() {
  const mr1 = [{ dataset: ["dataset sweep 1", "dataset sweep 2"] }];

  const mr2 = [{ algorithm: ["param sweep version 1"] }];
  return (
    <>
      <section className="card-global-param-sweep flex min-w-0 flex-col overflow-y-scroll @sm/multipane:flex-row  @sm/multipane:overflow-visible">
        <article className="flex flex-col gap-2 ">
          <FilterSection />
          <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll pt-2">
            <CheckboxGroup>Run Group 1</CheckboxGroup>
            <CheckboxGroup>Run Group 2</CheckboxGroup>
            <CheckboxGroup>Run Group 3</CheckboxGroup>
            <CheckboxGroup>Run Group 4</CheckboxGroup>
          </div>
        </article>
        <article className="flex flex-1 flex-col gap-2">
          <FilterSection />
          <div className="noscroll nowheel flex flex-col gap-2 overflow-y-scroll">
            <ParamListGroup multiruns={mr1} />
            <ParamListGroup multiruns={mr2} />
          </div>
        </article>
      </section>

      <Button
        grid={false}
        twClasses="card-configs-btn backdrop-blur-[2px] px-2 py-1 self-center text-runcoder-700 dark:text-runcoder-300 dark:bg-runcoder-900/40 hover:bg-white dark:hover:bg-runcoder-900 rounded-full gap-1 font-heading uppercase border-2 border-solid border-white dark:border-runcoder-800 text-xs bgruncoder-200/25 shadow-md hover:shadow-lg z-50"
      >
        <TbVersions className="z-[3] h-4 w-4" />
        Versions
      </Button>
    </>
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

function CheckboxGroup({ children }) {
  return (
    <label className="dark:text-rx-300 flex min-h-6 cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200 dark:hover:bg-runcoder-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-md bg-runcoder-500/10 checked:bg-blue-500 hover:bg-runcoder-500/30 hover:checked:bg-blue-500"
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
