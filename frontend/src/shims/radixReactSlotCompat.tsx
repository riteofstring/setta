import * as React from "react";

const SLOTTABLE_IDENTIFIER = Symbol("radix.slottable");

type AnyProps = Record<string, unknown>;
type SlottableComponent = React.FC<{ children?: React.ReactNode }> & {
  __radixId?: symbol;
};

function setRefValue<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }

  if (typeof ref === "function") {
    ref(value);
    return;
  }

  ref.current = value;
}

export function composeRefs<T>(...refs: Array<React.Ref<T> | undefined>) {
  return (value: T | null) => {
    for (const ref of refs) {
      setRefValue(ref, value);
    }
  };
}

export function createSlot(ownerName: string) {
  const SlotClone = createSlotClone(ownerName);
  const Slot = React.forwardRef<HTMLElement, AnyProps>(
    (props, forwardedRef) => {
      const { children, ...slotProps } = props;
      const childrenArray = React.Children.toArray(children);
      const slottable = childrenArray.find(isSlottable);

      if (slottable) {
        const newElement = slottable.props.children;
        const newChildren = childrenArray.map((child) => {
          if (child !== slottable) {
            return child;
          }
          if (React.Children.count(newElement) > 1) {
            return React.Children.only(null);
          }
          return React.isValidElement(newElement)
            ? newElement.props.children
            : null;
        });

        return (
          <SlotClone {...slotProps} ref={forwardedRef}>
            {React.isValidElement(newElement)
              ? React.cloneElement(newElement, undefined, newChildren)
              : null}
          </SlotClone>
        );
      }

      return (
        <SlotClone {...slotProps} ref={forwardedRef}>
          {children}
        </SlotClone>
      );
    },
  );

  Slot.displayName = `${ownerName}.Slot`;
  return Slot;
}

function createSlotClone(ownerName: string) {
  const SlotClone = React.forwardRef<HTMLElement, AnyProps>(
    (props, forwardedRef) => {
      const { children, ...slotProps } = props;

      if (React.isValidElement(children)) {
        const childRef = getElementRef(children);
        const mergedProps = mergeProps(slotProps, children.props);

        if (children.type !== React.Fragment) {
          mergedProps.ref = forwardedRef
            ? composeRefs(forwardedRef, childRef)
            : childRef;
        }

        return React.cloneElement(children, mergedProps);
      }

      return React.Children.count(children) > 1
        ? React.Children.only(null)
        : null;
    },
  );

  SlotClone.displayName = `${ownerName}.SlotClone`;
  return SlotClone;
}

export function createSlottable(ownerName: string) {
  const Slottable: SlottableComponent = ({ children }) => (
    <React.Fragment>{children}</React.Fragment>
  );
  Slottable.displayName = `${ownerName}.Slottable`;
  Slottable.__radixId = SLOTTABLE_IDENTIFIER;
  return Slottable;
}

function isSlottable(
  child: React.ReactNode,
): child is React.ReactElement<{ children?: React.ReactNode }> {
  return (
    React.isValidElement(child) &&
    typeof child.type === "function" &&
    "__radixId" in child.type &&
    child.type.__radixId === SLOTTABLE_IDENTIFIER
  );
}

function mergeProps(slotProps: AnyProps, childProps: AnyProps) {
  const overrideProps: AnyProps = { ...childProps };

  for (const propName in childProps) {
    const slotPropValue = slotProps[propName];
    const childPropValue = childProps[propName];
    const isHandler = /^on[A-Z]/.test(propName);

    if (isHandler) {
      if (slotPropValue && childPropValue) {
        overrideProps[propName] = (...args: Array<unknown>) => {
          if (typeof childPropValue === "function") {
            childPropValue(...args);
          }
          if (typeof slotPropValue === "function") {
            return slotPropValue(...args);
          }
          return undefined;
        };
      } else if (slotPropValue) {
        overrideProps[propName] = slotPropValue;
      }
      continue;
    }

    if (propName === "style") {
      overrideProps[propName] = {
        ...(slotPropValue as Record<string, unknown> | undefined),
        ...(childPropValue as Record<string, unknown> | undefined),
      };
      continue;
    }

    if (propName === "className") {
      overrideProps[propName] = [slotPropValue, childPropValue]
        .filter(Boolean)
        .join(" ");
    }
  }

  return {
    ...slotProps,
    ...overrideProps,
  };
}

function getElementRef(element: React.ReactElement<AnyProps>) {
  return element.props.ref;
}

export const Slot = createSlot("Slot");
export const Slottable = createSlottable("Slottable");
export const Root = Slot;
