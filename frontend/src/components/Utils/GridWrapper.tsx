export function GridWrapper({ gridStyles = "", children }) {
  return <StandardGrid gridStyles={gridStyles}>{children}</StandardGrid>;
}

function StandardGrid({ gridStyles, children }) {
  return (
    <article
      className={`grid-col-[1fr] grid-row-[1fr] col-start-1 col-end-2 row-start-2 row-end-3 grid h-full min-h-0 min-w-0 flex-1 overflow-hidden ${gridStyles}`}
    >
      {children}
    </article>
  );
}
