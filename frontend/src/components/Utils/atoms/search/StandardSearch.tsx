import type { InputHTMLAttributes, ReactNode, Ref } from "react";

type StandardSearchProps = InputHTMLAttributes<HTMLInputElement> & {
  twClasses?: string;
  outerClasses?: string;
  noLeftElement?: boolean;
  leftElement?: ReactNode | false;
  leftElementStyles?: string;
  rightElement?: ReactNode | false;
  inputStyles?: string | false;
  ref?: Ref<HTMLInputElement>;
};

const DEFAULT_PLACEHOLDER = "Search";
const DEFAULT_SEARCH_ICON_CLASSES =
  "gg-sort-az ml-[.4rem] !scale-75 text-setta-300 dark:text-setta-600";

function withDefault<T>(value: T | undefined, fallback: T): T {
  return value === undefined ? fallback : value;
}

function joinSearchClasses(
  ...parts: Array<string | false | undefined>
): string {
  return parts.filter(Boolean).join(" ");
}

function buildInputClasses(twClasses: string): string {
  return joinSearchClasses(
    "flex-grow outline-0 cursor-auto min-w-0 placeholder-setta-300 dark:placeholder-setta-700",
    twClasses,
  );
}

function buildOuterClasses(outerClasses: string): string {
  return joinSearchClasses(
    "flex min-w-0 mx-[2px] items-center relative nodrag dark:text-setta-200",
    outerClasses,
  );
}

function resolveInputClassName(
  inputStyles: string | false,
  twClasses: string,
): string {
  return inputStyles || buildInputClasses(twClasses);
}

function resolveLeftElement(leftElement: ReactNode | false): ReactNode {
  return leftElement || <i className={DEFAULT_SEARCH_ICON_CLASSES} />;
}

function renderLeftAdornment(
  hidden: boolean,
  leftElementStyles: string | undefined,
  leftElement: ReactNode | false,
): ReactNode {
  if (hidden) {
    return null;
  }

  return (
    <div
      className={joinSearchClasses(
        "absolute inset-y-0 left-0 grid select-none place-items-center",
        leftElementStyles,
      )}
    >
      {resolveLeftElement(leftElement)}
    </div>
  );
}

export function StandardSearch(props: StandardSearchProps) {
  const {
    placeholder,
    twClasses,
    outerClasses,
    noLeftElement,
    leftElement,
    leftElementStyles,
    rightElement,
    inputStyles,
    onChange,
    ref,
    ...inputProps
  } = props;
  const resolvedPlaceholder = withDefault(placeholder, DEFAULT_PLACEHOLDER);
  const resolvedTwClasses = withDefault(twClasses, "");
  const resolvedOuterClasses = withDefault(outerClasses, "");
  const resolvedNoLeftElement = withDefault(noLeftElement, false);
  const resolvedLeftElement = withDefault(leftElement, false);
  const resolvedRightElement = withDefault(rightElement, false);
  const resolvedInputStyles = withDefault(inputStyles, false);

  return (
    <search className={buildOuterClasses(resolvedOuterClasses)}>
      {renderLeftAdornment(
        resolvedNoLeftElement,
        leftElementStyles,
        resolvedLeftElement,
      )}
      <input
        className={resolveInputClassName(
          resolvedInputStyles,
          resolvedTwClasses,
        )}
        placeholder={resolvedPlaceholder}
        {...inputProps}
        ref={ref}
        tabIndex={0}
        onChange={onChange}
      />
      <div
        className={joinSearchClasses(
          "absolute inset-y-0 right-0 grid select-none place-items-center",
          leftElementStyles,
        )}
      >
        {resolvedRightElement}
      </div>
    </search>
  );
}
