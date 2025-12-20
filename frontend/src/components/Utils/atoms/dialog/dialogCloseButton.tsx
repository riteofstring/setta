import * as Dialog from "@radix-ui/react-dialog";

export function DialogCloseButton({ children, twClasses, onClick }) {
  return (
    <Dialog.Close asChild>
      <button
        className={`focus-visible:ring-2 inline-flex items-center nodrag cursor-pointer rounded-full text-sm px-3 py-1 font-bold ${twClasses}`}
        onClick={onClick}
      >
        {children}
      </button>
    </Dialog.Close>
  );
}
