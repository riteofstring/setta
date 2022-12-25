import { StandardSearch } from "./StandardSearch";

export function SimpleSearch({ textSize = "text-base", pad, twClasses = "" }) {
  // prettier-ignore
  const className = `w-full outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 ${textSize} ${pad || "pl-6 py-1"} ${twClasses}`;

  return <StandardSearch className={className} />;
}
