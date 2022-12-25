import { StandardSearch } from "./StandardSearch";

export function SimpleSearch({
  textSize = "text-base",
  pad = false,
  twClasses = "",
}) {
  // prettier-ignore
  const inputClasses = `w-full outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 pl-6 py-1 ${textSize}  ${twClasses}`;

  return <StandardSearch inputClasses={inputClasses} />;
}
