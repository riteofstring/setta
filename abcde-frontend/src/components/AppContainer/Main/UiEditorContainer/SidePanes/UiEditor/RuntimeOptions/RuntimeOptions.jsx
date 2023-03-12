export function RunTimeOptions({ sectionId, children }) {
  return (
    <>
      <div className="flex gap-2">
        <input
          type="checkbox"
          className="mr-2 mt-1 h-4 w-4 flex-shrink-0 cursor-pointer rounded-md border border-solid border-slate-300 bg-slate-100  text-blue-600 ring-offset-1 checked:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-300"
        />
        <label>{children} Test</label>
      </div>
    </>
  );
}
