import { StandardSearch } from "./StandardSearch";
import { GoButton } from "./StandardSearchRightButtons";

export function SimpleSearch({
  textSize = "text-base",
  pad = false,
  twClasses = "",
  simpleSearch,
  ...props
}) {
  // prettier-ignore
  const inputClasses = `w-full outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 pl-8 py-1 ${textSize}  ${twClasses}`;

  console.log("SimpleSearch");

  return (
    <StandardSearch
      inputClasses={inputClasses}
      simpleSearch={simpleSearch}
      rightElement={<GoButton />}
      {...props}
    />
  );
}
