import { HiChevronDown } from "react-icons/hi";
import { TbVersions } from "react-icons/tb";
import { Button } from "utils/atoms/buttons/Button";
import { StandardSearch } from "utils/atoms/search/StandardSearch";
import { StandardSearchRightBtn } from "utils/atoms/search/StandardSearchRightBtn";

export function GlobalParamSweepArea() {
  const mr1 = [
    { "Multi-run Version 1": ["dataset sweep 1", "dataset sweep 2"] },
  ];

  const mr2 = [{ "Multi-run v2": ["param sweep version 1"] }];
  return (
    <>
      <section className="card-global-param-sweep noscroll nowheel flex flex-col gap-2 overflow-y-scroll ">
        <ParamListGroup multiruns={mr1} />
        <ParamListGroup multiruns={mr2} />
        <ParamListGroup searchOnly={true} />
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
  if (searchOnly) {
    return (
      <article className={variants}>
        <ParamSearch unused={true} />
      </article>
    );
  }
  return (
    <article className={variants}>
      <ParamSearch placeholder={Object.keys(multiruns[0])} />
      <ParamSweepVersionsList multiruns={multiruns} />
    </article>
  );
}

function ParamSearch({ placeholder, unused = false }) {
  return (
    <search className="card-global-param-search flex h-7 w-full flex-col items-stretch overflow-visible">
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          disabled={unused}
          className={`h-4 w-4 ${
            unused ? "cursor-not-allowed" : "cursor-pointer"
          }  rounded-md bg-runcoder-500/10 checked:bg-blue-500 hover:bg-runcoder-500/30 hover:checked:bg-blue-500`}
        />
        <StandardSearch
          placeholder={placeholder}
          inputStyles={`flex-grow outline-0 cursor-auto  ${
            unused
              ? "bg-runcoder-50 dark:bg-runcoder-900/10"
              : "bg-white dark:bg-runcoder-900"
          }  rounded-full shadow-sm text-xs text-runcoder-600 font-medium pl-9 focus-visible:border-white dark:text-runcoder-300 dark:focus-visible:border-runcoder-900 focus-visible:ring-2 border border-solid border-runcoder-200 dark:border-runcoder-700 h-7`}
          leftElementStyles="pl-3"
          outerClasses="flex-1"
          rightElement={
            <StandardSearchRightBtn icon={<HiChevronDown />} size="w-7 h-7" />
          }
        />
      </label>
    </search>
  );
}

function ParamSweepVersionsList({ multiruns }) {
  const variants = "text-xs text-runcoder-500 dark:text-runcoder-300";
  if (multiruns) {
    return (
      <ul className="min-h-0  px-4">
        {multiruns.map((x) => {
          const key = Object.keys(x)[0];
          const values = x[key];
          return (
            <>
              {values.map((e) => (
                <li key={e} className={variants}>
                  <CheckboxGroup>{e}</CheckboxGroup>
                </li>
              ))}
            </>
          );
        })}
      </ul>
    );
  }
  return null;
}

function CheckboxGroup({ children }) {
  return (
    <label className="dark:text-rx-300 flex cursor-pointer items-center gap-2 truncate rounded px-1 py-0.5 text-sm text-runcoder-700 hover:bg-white hover:shadow-md dark:text-runcoder-200  dark:hover:bg-runcoder-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded-md bg-runcoder-500/10 checked:bg-blue-500 hover:bg-runcoder-500/30 hover:checked:bg-blue-500"
      />
      {children}
    </label>
  );
}
