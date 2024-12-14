import { StandardSearch } from "components/Utils/atoms/search/StandardSearch";
import { useHomePageSearch } from "state/definitions";

export function HomePageSearchBar() {
  const value = useHomePageSearch((x) => x.value);
  return (
    <SimpleSearchBar
      placeholder="Filter Project Configs"
      value={value}
      onChange={(v) => useHomePageSearch.setState({ value: v })}
    />
  );
}

export function SimpleSearchBar({
  divId,
  placeholder,
  value,
  onChange,
  ...props
}) {
  return (
    <StandardSearch
      id={divId}
      outerClasses="self-center w-[clamp(10rem,_30vw,_15rem)]  ml-4"
      inputStyles="flex-grow outline-0 cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-950 hover:bg-white  hover:ring-setta-200 dark:hover:ring-setta-600 focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 ring-2 ring-transparent focus-visible:ring-blue-300 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700"
      leftElementStyles="pl-1"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      {...props}
    />
  );
}
