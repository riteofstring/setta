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
      <Menubar.Trigger className="flex cursor-pointer select-none items-center justify-between gap-1 rounded-md py-1 px-2 text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800">
        File
        <ChevronDownIcon className="ml-1 h-3 w-3" />
      </Menubar.Trigger>

      <Menubar.Portal>
        <Menubar.Content
          className="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
          sideOffset={5}
          align="start"
          forceMount
        >
          <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
            <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
              New Project
            </div>
          </Menubar.Item>

          <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
            <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
              Open Project
            </div>
          </Menubar.Item>

          <Menubar.Separator className="my-1 h-px bg-setta-200 dark:bg-setta-700" />

          <Menubar.Sub>
            <Menubar.SubTrigger className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:!bg-setta-700 dark:data-[state=open]:text-setta-100">
              <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
                Export
                <ChevronRightIcon className="ml-auto h-3 w-3" />
              </div>
            </Menubar.SubTrigger>
            <Menubar.Portal>
              <Menubar.SubContent
                className="z-[100] min-w-[120px] rounded-md bg-white p-1 shadow-md data-[side=bottom]:animate-slideUpAndFade data-[side=left]:animate-slideRightAndFade data-[side=right]:animate-slideLeftAndFade data-[side=top]:animate-slideDownAndFade dark:bg-setta-850"
                sideOffset={2}
                alignOffset={-5}
              >
                <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
                  <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
                    As ZIP
                  </div>
                </Menubar.Item>
                <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
                  <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
                    As PDF
                  </div>
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
      <Menubar.Trigger className="flex cursor-pointer select-none items-center justify-between gap-1 rounded-md py-1 px-2 text-xs font-semibold leading-none text-setta-700 outline-none transition-colors duration-150 hover:bg-setta-100 focus-visible:ring-2 dark:text-setta-200 dark:hover:bg-setta-800">
        Settings
        <ChevronDownIcon className="ml-1 h-3 w-3" />
      </Menubar.Trigger>

      <Menubar.Portal>
        <Menubar.Content
          className="z-20 min-w-[200px] rounded-md border border-solid border-setta-100 bg-white p-1 shadow-xl transition-all will-change-[transform,opacity] dark:border-setta-700/50  dark:bg-setta-850"
          sideOffset={5}
          align="start"
          forceMount
        >
          <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
            <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
              Account
            </div>
          </Menubar.Item>

          <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
            <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
              Preferences
            </div>
          </Menubar.Item>

          <Menubar.Item className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-setta-500 data-[state=open]:bg-setta-100 data-[disabled]:text-setta-400 data-[highlighted]:text-setta-500 data-[state=open]:text-setta-800 dark:data-[highlighted]:bg-setta-900 dark:data-[state=open]:bg-setta-700 dark:data-[state=open]:text-setta-100">
            <div className="flex items-center gap-2 text-setta-800 group-data-[highlighted]:text-white dark:text-setta-200 dark:group-data-[highlighted]:text-white">
              Team
            </div>
          </Menubar.Item>
        </Menubar.Content>
      </Menubar.Portal>
    </Menubar.Menu>
  );
}
