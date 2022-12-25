import { AiOutlineSearch } from "react-icons/ai";
import { StandardSearchRightButtons } from "./StandardSearchRightButtons";
export function StandardSearch({
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
  className,
  ...props
}) {
  // prettier-ignore
  const classes = `w-full outline-0 cursor-auto ${textSize} ${pad} ${twClasses}`;

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
    }
  };

  return (
    <div className={`flex items-center relative nodrag ${outerClasses}`}>
      <div className="absolute left-0 grid place-items-center select-none">
        {leftElement || <AiOutlineSearch className="text-gray-400" />}
      </div>
      <input
        className={className || classes}
        placeholder={placeholder}
        {...props}
        tabIndex="0"
        onKeyDown={handleKeyPress}
      />

      {rightElement || <StandardSearchRightButtons />}
    </div>
  );
}
