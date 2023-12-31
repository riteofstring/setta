import * as Switch from "@radix-ui/react-switch";

export function Toggle(props) {
  const {
    twRootClasses = "",
    twThumbClasses = "",
    icon,
    disableBg = false,
    children,
    ...theRest
  } = props;

  const rootClasses = `items-center p-[0.2rem] w-7 h-3 bg-slate-400 dark:bg-runcoder-600 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus-visible:shadow-black data-[state='checked']:bg-blue-500 dark:data-[state='checked']:bg-blue-700 focus-visible:ring-2 ${twRootClasses}`;

  const thumbClasses = `block w-3 h-3 ${
    !disableBg && "bg-white dark:bg-runcoder-800"
  } rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 ${twThumbClasses}`;

  return (
    <Switch.Root className={rootClasses} {...theRest}>
      <Switch.Thumb className={thumbClasses}>{icon}</Switch.Thumb>
    </Switch.Root>
  );
}
