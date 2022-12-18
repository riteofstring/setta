import * as Switch from "@radix-ui/react-switch";
// import "./styles.css";

export function SwitchInputConfig() {
  return null;
}

export default function SwitchInput({
  value,
  defaultVal,
  onBlur,
  isDisabled,
  className,
}) {
  return (
    <Switch.Root
      className={`${className} items-center p-[0.2rem] w-7 h-3 bg-gray-400 rounded-full relative inline-flex cursor-pointer [-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus:shadow-black data-[state='checked']:bg-blue-500 SwitchRoot`}
      checked={value}
      disabled={isDisabled}
      onCheckedChange={onBlur}
    >
      <Switch.Thumb className="SwitchThumb block w-3 h-3 bg-white rounded-full transition-all will-change-transform data-[state='checked']:translate-x-4 " />
    </Switch.Root>
  );
}
