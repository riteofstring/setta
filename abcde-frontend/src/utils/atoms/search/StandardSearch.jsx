import { AiOutlineSearch } from "react-icons/ai";

export default function StandardSearch({
  simpleSearch = false,
  textSize = "text-base",
  placeholder = "Search",
  dropdown = false,
  ...props
}) {
  const otherStyling = simpleSearch
    ? "bg-transparent border-b border-t-0 border-r-0 border-l-0 border-solid border-gray-300"
    : "bg-white rounded-full shadow-sm";

  const size = simpleSearch ? "w-4 h-4" : "w-10 h-10";
  const padding = simpleSearch ? "pl-6 py-1" : "pl-10";
  const focus = simpleSearch ? "focus:border-blue-300" : "focus:ring-2";

  const className = `${otherStyling} ${textSize} ${padding} ${focus} w-full outline-0 cursor-auto `;

  return (
    <div className="flex items-center relative nodrag">
      <div
        className={`${size} absolute left-0 grid place-items-center select-none`}
      >
        <AiOutlineSearch className="text-gray-400" />
      </div>
      <input
        className={className}
        placeholder={placeholder}
        {...props}
        tabindex="0"
      />
      {dropdown && (
        <IconButton
          rounded={`${!simpleSearch ? "rounded-full" : "rounded-2xl"}`}
          bg={` ${!simpleSearch ? "bg-white" : "bg-transparent"}`}
          size={size}
          padding="p-0"
          grid={true}
          twClasses="absolute right-0 hover:bg-gray-100"
          {...toggleButtonProps}
          aria-label={"toggle menu"}
          icon={isOpen ? <HiChevronUp /> : <HiChevronDown />}
        />
      )}
    </div>
  );
}
