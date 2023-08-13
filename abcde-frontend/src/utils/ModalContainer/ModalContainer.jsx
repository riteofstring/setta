import * as Dialog from "@radix-ui/react-dialog";
import "./styles.css";

export function ModalContainer({ content, open, setOpen, children }) {
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      {children}
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 animate-[overlayShow_150ms_cubic-bezier(0.16,_1,_0.3,_1)] bg-[rgba(0,0,0,0.5)] backdrop-blur-sm " />
        <Dialog.Content className="animate-[contentShow_150ms_cubic-bezier(0.16,_1,_ 0.3,_ 1) fixed top-1/2 left-1/2 z-[100] flex max-h-[85vh] w-[90vw] max-w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white px-7 py-7 shadow-xl dark:border dark:border-runcoder-600 dark:bg-runcoder-800">
          {content}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
