import { StandardSearch } from "./StandardSearch";

export default function StandardSearch({
  simpleSearch = false,
  textSize = "text-base",
  placeholder = "Search",
  dropdown = false,
  goButton,
  pad,
  twClasses = "",
  outerClasses = "",
  onKeyPress,
  toggleButtonProps,
  isOpen,
  leftElement = false,
  rightElement = false,
}) {
  // prettier-ignore
  const className = `w-full outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300  focus-visible:border-blue-300 ${textSize} ${pad || "pl-6 py-1"} ${twClasses}`;

  return <StandardSearch className={className} />;
}
