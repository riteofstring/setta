export function LoadingSpinner() {
  return (
    <div className="single-cell-container absolute h-full w-full">
      <div className="single-cell-child inset-0 place-self-center bg-transparent bg-opacity-50">
        <div className="gg-spinner !scale-150 before:!border-t-blue-500 after:!border-blue-500"></div>
      </div>
      <div className="relative z-10" />
    </div>
  );
}
