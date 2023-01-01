import * as Dialog from "@radix-ui/react-dialog";

export function DialogCloseButton({ children, className, onClick }) {
  return (
    <Dialog.Close asChild>
      <button className={className} onClick={onClick}>
        {children}
      </button>
    </Dialog.Close>
  );
}
