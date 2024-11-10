import { IconButton } from "components/Utils/atoms/buttons/IconButton";

export function LockPositionButton() {
  return (
    <IconButton
      // {...props}
      icon={<i className="gg-lock-unlock !scale-[.4]" />}
      color="text-setta-600 hover:text-orange-500 dark:hover:text-orange-700"
      bg="bg-transparent justify-content-center mr-1"
      size="w-4 h-4"
      padding="p-0"
      // twClasses={twClasses}
    />
  );
}

// for when the locked state is added:
// <i className="gg-lock !scale-[.4]" />
