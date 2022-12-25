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
  const className = `w-full outline-0 cursor-auto bg-white rounded-full shadow-sm ${textSize} ${pad || "pl-10"} focus-visible:ring-2 ${twClasses}`;

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
    }
  };

  return <StandardSearch className={className} />;
}
