export default function GridWrapper({ children, ...props }) {
  return (
    <StandardGrid {...props}>
      <FlexForm {...props}>{children}</FlexForm>
    </StandardGrid>
  );
}

function StandardGrid({ gridProps, children }) {
  return (
    <div
      className={`grid grid-col-[1fr] grid-row-[1fr] col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 h-full ${gridProps}`}
    >
      {children}
    </div>
  );
}

function FlexForm({ flexFormWrap = false, children }) {
  if (flexFormWrap) {
    return (
      <div className="flex flex-col w-full min-h-[200px] justify-center items-center">
        {children}
      </div>
    );
  } else {
    return <>{children}</>;
  }
}
