import { useHomePageSearch } from "state/definitions";

export function HomePageSearchBar({
  className = "",
}: {
  className?: string;
}) {
  const value = useHomePageSearch((x) => x.value);

  return (
    <search
      className={`nodrag relative mx-[2px] flex w-[clamp(10rem,_30vw,_15rem)] min-w-0 items-center self-center dark:text-setta-200 ${className}`}
    >
      <div className="pointer-events-none absolute left-0 grid select-none place-items-center pl-1">
        <i
          className="gg-sort-az ml-[.4rem] !scale-75 text-setta-300 dark:text-setta-600"
          aria-hidden="true"
        />
      </div>
      <input
        className="flex-grow cursor-auto overflow-hidden rounded-full border-setta-500 bg-setta-100 py-1 pl-7 text-xs text-setta-900 placeholder-setta-300 outline-offset-2 outline-blue-500 hover:bg-white focus:bg-white focus-visible:outline dark:bg-setta-950 dark:text-setta-200 dark:placeholder-setta-700"
        placeholder="Filter Workspace Projects"
        tabIndex={0}
        value={value}
        onChange={(e) => useHomePageSearch.setState({ value: e.target.value })}
      />
    </search>
  );
}
