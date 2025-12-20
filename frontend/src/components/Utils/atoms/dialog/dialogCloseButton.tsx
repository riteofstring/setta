import * as Dialog from "@radix-ui/react-dialog";

export function DialogCloseButton({ children, twClasses, onClick }) {
  return (
    <Dialog.Close asChild>
      <button
        className={`nodrag inline-flex cursor-pointer items-center rounded-full px-3 py-1 text-sm font-bold focus-visible:ring-2 ${twClasses}`}
        onClick={onClick}
      >
        {children}
      </button>
    </Dialog.Close>
  );
}
