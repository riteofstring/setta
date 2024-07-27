import * as Menubar from "@radix-ui/react-menubar";

export function MenuItem({ children, shortcut, onClick }) {
  //
  return (
    <Menubar.Item
      onClick={onClick}
      className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-slate-500 data-[state=open]:bg-slate-100 data-[disabled]:text-runcoder-400 data-[highlighted]:text-runcoder-500 data-[state=open]:text-runcoder-800 dark:data-[highlighted]:bg-slate-900 dark:data-[state=open]:bg-runcoder-700 dark:data-[state=open]:text-runcoder-100"
    >
      <div className="flex items-center gap-2 text-runcoder-800 group-data-[highlighted]:text-white dark:text-runcoder-200 dark:group-data-[highlighted]:text-white">
        {children}
      </div>
      <div className="ml-auto pl-5 tracking-tight text-runcoder-400 group-data-[disabled]:text-runcoder-300 group-data-[highlighted]:text-white dark:group-data-[disabled]:text-runcoder-500 dark:group-data-[highlighted]:text-runcoder-100">
        {shortcut}
      </div>
    </Menubar.Item>
  );
}
