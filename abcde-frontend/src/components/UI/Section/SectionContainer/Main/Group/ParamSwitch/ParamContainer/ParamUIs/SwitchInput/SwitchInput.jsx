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
      className={`${className} w-10 h-4 bg-gray-400 rounded-full relative flex justify-items-center[-webkit-tap-highlight-color:rgba(0,_0,_0,_0)] focus:shadow-black checked:bg-blue-500 SwitchRoot`}
      checked={value}
      disabled={isDisabled}
      onCheckedChange={onBlur}
    >
      <Switch.Thumb className="SwitchThumb block w-4 h-4 bg-white rounded-full transition-all will-change-transform data-[state='checked']:translate-x-8 " />
    </Switch.Root>
  );
}
