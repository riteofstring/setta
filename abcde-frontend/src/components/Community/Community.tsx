import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { FlexWrapper } from "components/AppContainer/FlexWrapper/FlexWrapper";
import { HeaderContainer } from "components/AppContainer/Header/Header";
import { Resizable } from "re-resizable";
import { useState } from "react";
import { AiFillHeart } from "react-icons/ai";
import { BsCheck } from "react-icons/bs";
import { StandardSearch } from "utils/atoms/search/StandardSearch";

export function CommunityPage() {
  return (
    <FlexWrapper>
      <HeaderContainer />
      <div className="flex h-[calc(100vh_-_56px)] bg-white">
        <TemplateListPane />
        <TemplateDetailPane />
      </div>
    </FlexWrapper>
  );
}

function TemplateListPane() {
  return (
    <Resizable
      defaultSize={{
        width: "350px",
        height: "100%",
      }}
      maxWidth="50%"
      minWidth="200px"
      className="bg-slate-50 py-8 px-11 shadow-lg"
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
    >
      <ListContent />
    </Resizable>
  );
}

function ListContent() {
  return (
    <>
      <h2 className="pb-3 text-base font-bold uppercase tracking-widest text-slate-400">
        Templates
      </h2>
      <div className="flex pb-4">
        <StandardSearch
          inputStyles="flex-grow outline-0 cursor-auto bg-transparent [border-width:0_0_1px_0] border-solid border-slate-300  focus-visible:border-blue-300 pl-7 py-1"
          leftElementStyles="pl-1"
          // onChange={(e) => setFilter(e.target.value)}
          aria-label="Community Templates Search"
        />
        <SearchFilterDropdown />
      </div>
      <ListItem />
      <ListItem />
      <ListItem />
      <ListItem />
    </>
  );
}

function TemplateDetailPane() {
  return (
    <div className=" flex w-full min-w-[1px] flex-col items-center overflow-auto py-8 px-12">
      <DetailsContent />
    </div>
  );
}

function DetailsContent() {
  // rounded-md border border-solid border-white bg-slate-50 py-8 px-12 shadow-md
  return (
    <section className="@container flex w-full max-w-screen-lg flex-col gap-4">
      <h1 className="font-heading text-4xl font-bold text-slate-600">
        PyTorch Adapt
      </h1>
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-full bg-slate-500" />
        <div className="flex-1">By Kevin Musgrave</div>
        <button className="flex cursor-pointer items-center gap-2 rounded-md border border-solid border-slate-200 py-1 px-3 text-slate-500 transition-all hover:border-white hover:bg-slate-400 hover:text-white hover:shadow-md">
          <AiFillHeart /> Like
        </button>
        <button className="cursor-pointer rounded-md border border-solid border-white bg-slate-400 py-1 px-3 font-bold text-white transition-all hover:border-white hover:bg-white hover:text-slate-500 hover:shadow-md">
          Clone Project
        </button>
      </div>
      <div className="mb-8 h-96 overflow-hidden rounded-lg bg-slate-400 py-6 px-8 shadow-md"></div>
      <div className="@lg:flex-col flex gap-8">
        <article className="prose">
          <h2>The Best Ever</h2>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
            semper et neque ac aliquam. In in ornare sapien. Sed quam dui,
            commodo non egestas eget, rhoncus ut metus. Donec vitae hendrerit
            ipsum. Sed et sem ac turpis tempor facilisis. Nam neque nunc, varius
            ac mattis vel, facilisis at magna. Sed id blandit ligula, fringilla
            suscipit dui.
          </p>
          <p>
            Nullam sit amet mi rutrum, consequat purus et, euismod elit. Nullam
            eu ex urna. Cras laoreet, diam sit amet consequat suscipit, justo
            ipsum viverra nisi, sit amet vulputate ligula nibh ut ex. Morbi quis
            porttitor velit, eu tincidunt mi. Integer in ante vel enim ornare
            eleifend. Nulla molestie leo odio, quis bibendum quam maximus et.
            Sed libero elit, faucibus eu ipsum in, pharetra condimentum quam.
          </p>

          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit. Curabitur
            semper et neque ac aliquam. In in ornare sapien. Sed quam dui,
            commodo non egestas eget, rhoncus ut metus. Donec vitae hendrerit
            ipsum. Sed et sem ac turpis tempor facilisis. Nam neque nunc, varius
            ac mattis vel, facilisis at magna. Sed id blandit ligula, fringilla
            suscipit dui.
          </p>
          <p>
            Nullam sit amet mi rutrum, consequat purus et, euismod elit. Nullam
            eu ex urna. Cras laoreet, diam sit amet consequat suscipit, justo
            ipsum viverra nisi, sit amet vulputate ligula nibh ut ex. Morbi quis
            porttitor velit, eu tincidunt mi. Integer in ante vel enim ornare
            eleifend. Nulla molestie leo odio, quis bibendum quam maximus et.
            Sed libero elit, faucibus eu ipsum in, pharetra condimentum quam.
          </p>
        </article>
        <div className="flex flex-col gap-8">
          <div>
            <h3 className="font-heading font-bold uppercase tracking-widest text-slate-400">
              tags
            </h3>
            <div className="flex flex-wrap gap-2">
              <TagButton>NumPy</TagButton>
              <TagButton>PyPy</TagButton>
              <TagButton>ML</TagButton>
              <TagButton>Diffusor</TagButton>
              <TagButton>Style Transfer</TagButton>
              <TagButton>Pandas</TagButton>
            </div>
          </div>
          <div>
            <h3 className="font-heading font-bold uppercase tracking-widest text-slate-400">
              share
            </h3>
          </div>
        </div>
      </div>
    </section>
  );
}

function TagButton({ children }) {
  return (
    <button className="cursor-pointer rounded-md border border-solid border-slate-200 py-1 px-3   transition-all hover:border-white hover:bg-slate-400 hover:text-white hover:shadow-md">
      {children}
    </button>
  );
}

function ListItem() {
  return (
    <div className="flex gap-4">
      <div className="h-5 w-5 rounded-md bg-slate-400"></div>
      <div className="flex flex-col">
        <h3 className="font-heading text-xl font-bold text-slate-500">Item</h3>
        <p className="text-sm">lorem ipsum</p>
      </div>
    </div>
  );
}

const SearchFilterDropdown = () => {
  const [bookmarksChecked, setBookmarksChecked] = useState(true);
  const [urlsChecked, setUrlsChecked] = useState(false);

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="IconButton" aria-label="Customise options">
          Types
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content className="DropdownMenuContent" sideOffset={5}>
          <DropdownMenu.CheckboxItem
            className="DropdownMenuCheckboxItem"
            checked={bookmarksChecked}
            onCheckedChange={setBookmarksChecked}
          >
            <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator">
              <BsCheck />
            </DropdownMenu.ItemIndicator>
            Show Bookmarks <div className="RightSlot">⌘+B</div>
          </DropdownMenu.CheckboxItem>
          <DropdownMenu.CheckboxItem
            className="DropdownMenuCheckboxItem"
            checked={urlsChecked}
            onCheckedChange={setUrlsChecked}
          >
            <DropdownMenu.ItemIndicator className="DropdownMenuItemIndicator">
              <BsCheck />
            </DropdownMenu.ItemIndicator>
            Show Full URLs
          </DropdownMenu.CheckboxItem>

          <DropdownMenu.Arrow className="DropdownMenuArrow" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};
