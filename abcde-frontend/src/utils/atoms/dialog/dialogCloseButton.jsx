import * as Dialog from "@radix-ui/react-dialog";

export function DialogCloseButton({ children, className, onClick }) {
  return (
    <Dialog.Close>
      <button className={className} onClick={onClick}>
        {children}
      </button>
    </Dialog.Close>
  );
}
