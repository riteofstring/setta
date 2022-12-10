import { AiOutlineClose } from "react-icons/ai";

export default function CustomCloseButton(props) {
  return (
    <button
      className="nodrag rounded-full p-1.5 hover:bg-gray-100 active:bg-gray-200"
      {...props}
    >
      <AiOutlineClose />
    </button>
  );
}
