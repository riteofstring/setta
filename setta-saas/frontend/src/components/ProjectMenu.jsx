import * as Menubar from "@radix-ui/react-menubar";
import { ChevronRightIcon, ChevronDownIcon } from "@radix-ui/react-icons";

export default function ProjectMenu() {
  return (
    <Menubar.Root className="flex items-center ml-4">
      <FileMenu />
      <SettingsMenu />
    </Menubar.Root>
  );
}

function FileMenu() {
  return (
    <Menubar.Menu>
      <Menubar.Trigger className="flex h-7 items-center rounded-md px-3 py-1 text-xs font-medium text-setta-700 transition-colors hover:bg-setta-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-1 data-[state=open]:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800 dark:data-[state=open]:bg-setta-850">
        File
        <ChevronDownIcon className="ml-1 h-3 w-3" />
      </Menubar.Trigger>

      <Menubar.Portal>
        <Menubar.Content
          className="z-[100] min-w-[120px] rounded-md bg-white p-1 shadow-md data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:bg-setta-850"
          sideOffset={5}
          align="start"
          forceMount
        >
          <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
            New Project
          </Menubar.Item>

          <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
            Open Project
          </Menubar.Item>

          <Menubar.Separator className="my-1 h-px bg-setta-200 dark:bg-setta-700" />

          <Menubar.Sub>
            <Menubar.SubTrigger className="flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
              Export
              <ChevronRightIcon className="ml-auto h-3 w-3" />
            </Menubar.SubTrigger>
            <Menubar.Portal>
              <Menubar.SubContent
                className="z-[100] min-w-[120px] rounded-md bg-white p-1 shadow-md data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:bg-setta-850"
                sideOffset={2}
                alignOffset={-5}
              >
                <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
                  As ZIP
                </Menubar.Item>
                <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
                  As PDF
                </Menubar.Item>
              </Menubar.SubContent>
            </Menubar.Portal>
          </Menubar.Sub>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}

function SettingsMenu() {
  return (
    <Menubar.Menu>
      <Menubar.Trigger className="flex h-7 items-center rounded-md px-3 py-1 text-xs font-medium text-setta-700 transition-colors hover:bg-setta-100 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-500 focus-visible:ring-offset-1 data-[state=open]:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800 dark:data-[state=open]:bg-setta-850">
        Settings
        <ChevronDownIcon className="ml-1 h-3 w-3" />
      </Menubar.Trigger>

      <Menubar.Portal>
        <Menubar.Content
          className="z-[100] min-w-[120px] rounded-md bg-white p-1 shadow-md data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:bg-setta-850"
          sideOffset={5}
          align="start"
          forceMount
        >
          <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
            Account
          </Menubar.Item>

          <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
            Preferences
          </Menubar.Item>

          <Menubar.Item className="flex cursor-pointer items-center rounded-md px-2 py-1.5 text-xs text-setta-700 outline-none hover:bg-setta-50 dark:text-setta-300 dark:hover:bg-setta-800">
            Team
          </Menubar.Item>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}
