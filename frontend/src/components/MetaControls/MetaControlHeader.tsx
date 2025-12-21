import * as Menubar from "@radix-ui/react-menubar";
import { DeleteOrHideButtonCore } from "components/Section/Header/DeleteOrHideButton";
import { LockPositionButtonCore } from "components/Section/Header/LockPositionButton";
import { SectionTitle } from "components/Section/Header/SectionTitle";
import { MenuDropdown } from "components/Utils/atoms/menubar/menudropdown";
import { MenuItem } from "components/Utils/atoms/menubar/menudropdownitem";
import { TbAdjustmentsHorizontal } from "react-icons/tb";
import { SETTA_PREVENT_SECTION_ACTIVE_CSS } from "utils/constants";

const META_CONTROL_TITLE_PROPS = {
  editing:
    "cursor-text nodrag px-1 py-0 leading-5 -ml-1 bg-setta-100 focus-visible:ring-0 focus-visible:outline-none rounded-md box-border border border-solid border-transparent focus-visible:border-blue-500 dark:bg-setta-800 w-full dark:text-white font-bold text-[.7rem] tracking-tight",
  notEditing:
    "px-1 py-0 -ml-1 w-full focus-visible:ring-0 focus-visible:outline-none box-border rounded-md border border-solid border-transparent focus-visible:border-blue-500 leading-5 font-bold tracking-tight cursor-move max-w-full text-[.7rem] truncate text-setta-700 dark:text-setta-300",
};

const META_CONTROL_MENU_TRIGGER_CLASSNAME =
  "nodrag w-[14px] h-[14px] flex cursor-pointer select-none items-center justify-center rounded-full p-1 mr-1 -ml-0.5 aspect-square font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800 [&_*]:data-[state=open]:!text-setta-300 dark:[&_*]:data-[state=open]:!text-setta-500";

const META_CONTROL_MENU_CONTENT_CLASSNAME =
  "z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 transition-all will-change-[transform,opacity] dark:border-setta-700/50 dark:bg-setta-850";

const META_CONTROL_SECTION_TYPE = "metacontrols";

type MetaControlHeaderProps = {
  label: string;
  isLocked: boolean;
  onToggleLock: () => void;
  onDelete: () => void;
  onRename: (value: string) => void;
};

export function MetaControlHeader({
  label,
  isLocked,
  onToggleLock,
  onDelete,
  onRename,
}: MetaControlHeaderProps) {
  return (
    <header className="section-title flex w-full min-w-0 flex-row items-center px-2">
      <Menubar.Root className={SETTA_PREVENT_SECTION_ACTIVE_CSS}>
        <MenuDropdown
          triggerClassName={META_CONTROL_MENU_TRIGGER_CLASSNAME}
          contentClassName={META_CONTROL_MENU_CONTENT_CLASSNAME}
          contentAlign="start"
          contentSideOffset={5}
          contentAlignOffset={-3}
          trigger={
            <TbAdjustmentsHorizontal
              className="text-setta-300 transition-colors group-hover/card-section:text-blue-500 dark:text-setta-500 dark:group-hover/card-section:text-[#0084ff]"
              aria-label={META_CONTROL_SECTION_TYPE}
            />
          }
        >
          <MenuItem onClick={onToggleLock}>
            {isLocked ? "Unlock Position" : "Lock Position"}
          </MenuItem>
          <MenuItem
            onClick={onDelete}
            className="text-red-500 dark:text-red-400"
          >
            Delete
          </MenuItem>
        </MenuDropdown>
      </Menubar.Root>
      <div className="min-w-0 flex-1">
        <SectionTitle
          title={label}
          titleProps={META_CONTROL_TITLE_PROPS}
          editable={{ onRename }}
        />
      </div>
      <div className="z-10 ml-auto flex items-center">
        <LockPositionButtonCore
          isLocked={isLocked}
          isGroup={false}
          onClick={onToggleLock}
        />
        <DeleteOrHideButtonCore
          icon={<i className="gg-close" />}
          onClick={onDelete}
          size="h-4 min-w-4"
        />
      </div>
    </header>
  );
}
