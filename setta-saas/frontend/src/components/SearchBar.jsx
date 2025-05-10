import { useState } from "react";
import { MagnifyingGlassIcon } from "@radix-ui/react-icons";

export default function SearchBar() {
  const [value, setValue] = useState("");

  return (
    <div className="relative self-center w-[clamp(10rem,_30vw,_15rem)] ml-4">
      <div className="absolute left-0 pl-1 top-1/2 -translate-y-1/2">
        <MagnifyingGlassIcon className="h-4 w-4 text-setta-500 dark:text-setta-400" />
      </div>

      <input
        type="text"
        placeholder="Search projects..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="flex-grow cursor-auto overflow-hidden bg-setta-100 dark:bg-setta-950 border-setta-500 hover:bg-white outline-offset-2 focus:bg-white rounded-full text-xs text-setta-900 dark:text-setta-200 focus-visible:outline outline-blue-500 pl-7 py-1 placeholder-setta-300 dark:placeholder-setta-700 w-full"
      />
    </div>
  );
}
