import * as Popover from "@radix-ui/react-popover";
import { HiChevronDown } from "react-icons/hi";
import { IoClose } from "react-icons/io5";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function ListContent() {
  return (
    <>
      <p className="pb-3 text-base font-bold uppercase tracking-widest text-slate-400">
        Templates
      </p>
      <div className="flex gap-2 self-stretch pb-4">
        <StandardSearch
          outerClasses="flex-1 "
          inputStyles="w-full outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-slate-300  focus-visible:border-blue-300 pl-7 py-1"
          leftElementStyles="pl-1"
          // onChange={(e) => setFilter(e.target.value)}
          aria-label="Community Templates Search"
        />
        <SearchFilterPopover />
      </div>
      <div className="flex flex-col gap-4">
        <ListItem />
        <ListItem />
        <ListItem />
        <ListItem />
      </div>
    </>
  );
}

function ListItem() {
  return (
    <div className="flex cursor-pointer flex-col rounded-lg py-2 px-4 transition-all hover:bg-white hover:shadow-md">
      <p className="font-heading text-xl font-bold text-slate-500">Item</p>
      <p className="text-sm">
        Nullam sit amet mi rutrum, consequat purus et, euismod elit. Nullam eu
        ex urna.
      </p>
    </div>
  );
}

function SearchFilterPopover() {
  return (
    <Popover.Root>
      <Popover.Trigger className="flex cursor-pointer items-center gap-2 rounded-full border border-solid border-slate-100 bg-white py-1 px-3 text-xs uppercase hover:bg-slate-200">
        Types <HiChevronDown />
      </Popover.Trigger>
      <Popover.Anchor />
      <Popover.Portal>
        <Popover.Content className="absolute -left-[126px] gap-2 rounded-lg bg-white py-3 px-4 shadow-md">
          <PopoverItem>Projects</PopoverItem>
          <PopoverItem>Cards</PopoverItem>
          <PopoverItem>Components</PopoverItem>
          <PopoverItem>Collections</PopoverItem>
          <Popover.Close asChild>
            <IoClose className="absolute top-1 right-1 h-6 w-6 cursor-pointer rounded-full p-1 text-slate-400 hover:bg-red-500 hover:text-white" />
          </Popover.Close>
          <Popover.Arrow className="fill-white" />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

function PopoverItem({ children }) {
  return (
    <div className="flex gap-2">
      <input
        type="checkbox"
        className="mr-2 mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded-md border-slate-300 bg-slate-400 text-blue-600 ring-offset-1 checked:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-300"
      />
      <label>{children}</label>
    </div>
  );
}
