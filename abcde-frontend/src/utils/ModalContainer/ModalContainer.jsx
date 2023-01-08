import * as Dialog from "@radix-ui/react-dialog";
import "./styles.css";

export default function ModalContainer({ content, children }) {
  return (
    <Dialog.Root>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 backdrop-blur-sm bg-[rgba(0,0,0,0.5)] animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] " />
        <Dialog.Content className="bg-white rounded-lg shadow-lg fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90vw] max-w-[800px] max-h-[85vh] px-10 py-7 animate-[contentShow_150ms_cubic-bezier(0.16,_1,_ 0.3,_ 1) z-[100]">
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
