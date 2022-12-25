import { AiOutlineSearch } from "react-icons/ai";

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
  ...props
}) {
  // prettier-ignore
  const className = `w-full outline-0 cursor-auto ${otherStyles(simpleSearch)} ${textSize} ${padStyle(pad, simpleSearch)} ${focusStyles(simpleSearch)} ${twClasses}`;

  const handleKeyPress = (event) => {
    if (event.key === "Enter") {
    }
  };

  return (
    <div className={`flex items-center relative nodrag ${outerClasses}`}>
      <div
        className={`${size(
          simpleSearch
        )} absolute left-0 grid place-items-center select-none`}
      >
        {leftElement || <AiOutlineSearch className="text-gray-400" />}
      </div>
      <input
        className={className}
        placeholder={placeholder}
        {...props}
        tabindex="0"
        onKeyPress={handleKeyPress}
      />

      {rightElement || (
        <StandardButtons
          dropdown={dropdown}
          goButton={goButton}
          simpleSearch={simpleSearch}
          size={size}
          toggleButtonProps={toggleButtonProps}
          twClasses={twClasses}
          isOpen={isOpen}
        />
      )}
    </div>
  );
}

function otherStyles(simpleSearch) {
  if (simpleSearch) {
    return "bg-transparent [border-width:0_0_1px_0] border-solid border-gray-300";
  }
  return "bg-white rounded-full shadow-sm";
}

function padStyle(pad, simpleSearch) {
  if (pad) {
    return pad;
  }
  if (simpleSearch) {
    return "pl-6 py-1";
  }
  return "pl-10";
}

function focusStyles(simpleSearch) {
  if (simpleSearch) {
    return "focus-visible:border-blue-300";
  }
  return "focus-visible:ring-2";
}

function size(simpleSearch) {
  if (simpleSearch) {
    return "w-4 h-4";
  }
  return "w-10 h-10";
}
