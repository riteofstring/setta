import * as Menubar from "@radix-ui/react-menubar";

export function MenuItem({ children, shortcut, onClick }) {
  //
  return (
    <Menubar.Item
      onClick={onClick}
      className="group relative flex h-[25px] cursor-pointer select-none items-center rounded px-[10px] text-xs leading-none outline-none data-[disabled]:pointer-events-none data-[state=open]:bg-slate-100 data-[highlighted]:bg-slate-500 data-[disabled]:text-slate-400 data-[highlighted]:text-slate-500 data-[state=open]:text-slate-200 dark:data-[state=open]:bg-slate-800 dark:data-[highlighted]:bg-slate-900 dark:data-[state=open]:text-slate-900"
    >
      <div className="flex items-center gap-2 group-data-[highlighted]:text-white dark:group-data-[highlighted]:text-slate-900">
        {children}
      </div>
      <div className="ml-auto pl-5 tracking-tight text-slate-400 group-data-[disabled]:text-slate-300 group-data-[highlighted]:text-white dark:group-data-[disabled]:text-slate-500 dark:group-data-[highlighted]:text-slate-800">
        {shortcut}
      </div>
    </Menubar.Item>
  );
}
