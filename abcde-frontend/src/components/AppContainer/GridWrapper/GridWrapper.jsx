export default function GridWrapper({
  gridStyles = "",
  flexStyles = "",
  flexFormWrap = false,
  children,
  ...props
}) {
  return (
    <StandardGrid gridStyles={gridStyles} {...props}>
      <FlexForm flexStyles={flexStyles} flexFormWrap={flexFormWrap} {...props}>
        {children}
      </FlexForm>
    </StandardGrid>
  );
}

function StandardGrid({ gridStyles, children }) {
  return (
    <div
      className={`grid grid-col-[1fr] grid-row-[1fr] col-start-1 col-end-2 row-start-2 row-end-3 min-h-0 min-w-0 h-full ${gridStyles}`}
    >
      {children}
    </div>
  );
}

function FlexForm({ flexFormWrap = false, flexStyles, children }) {
  if (flexFormWrap) {
    return (
      <div
        className={`LOL flex flex-col min-h-[200px] justify-center items-center ${flexStyles}`}
      >
        {children}
      </div>
    );
  } else {
    return <>{children}</>;
  }
}
