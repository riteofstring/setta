import * as Switch from "@radix-ui/react-switch";

export default function Toggle(props) {
  const {
    twRootClasses = "",
    twThumbClasses = "",
    children,
    ...theRest
  } = props;

  const rootClasses = `items-center p-[0.2rem] w-7 h-3 bg-gray-400 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus:shadow-black data-[state='checked']:bg-blue-500 focus:ring-2 ${twRootClasses}`;

  const thumbClasses = `SwitchThumb block w-3 h-3 bg-white rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 ${twThumbClasses}`;

  return (
    <Switch.Root className={rootClasses} {...theRest}>
      <Switch.Thumb className={thumbClasses} />
    </Switch.Root>
  );
}
