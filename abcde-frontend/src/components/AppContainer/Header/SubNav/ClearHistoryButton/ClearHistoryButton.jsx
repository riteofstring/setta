import Button from "components/Common/Button/Button";
import { BiHistory } from "react-icons/bi";

export default function ClearHistoryButton() {
  return (
    <Button
      size="xs"
      py="py-1"
      px="px-2"
      bg="bg-white"
      text="text-gray-800"
      hover="hover:bg-gray-200"
      borderRadius="rounded-md"
    >
      <BiHistory />
      Clear History
    </Button>
  );
}
