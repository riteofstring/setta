import classNames from "classnames";
import React, { forwardRef } from "react";

import { DragHandle } from "../DragHandle/DragHandle";
import styles from "./Container.module.css";
import { Remove } from "./Remove";

export const Container = forwardRef(
  (
    {
      children,
      columns = 1,
      handleListeners,
      horizontal,
      hover,
      onClick,
      onRemove,
      label,
      placeholder,
      style,
      scrollable,
      shadow,
      unstyled,
      ...props
    },
    ref
  ) => {
    const Component = onClick ? "button" : "div";

    return (
      <Component
        {...props}
        ref={ref}
        style={{
          ...style,
          "--columns": columns,
        }}
        className={classNames(
          styles.Container,
          unstyled && styles.unstyled,
          horizontal && styles.horizontal,
          hover && styles.hover,
          placeholder && styles.placeholder,
          scrollable && styles.scrollable,
          shadow && styles.shadow
        )}
        onClick={onClick}
        tabIndex={onClick ? 0 : undefined}
      >
        {label ? (
          <div className={styles.Header}>
            {label}
            {onRemove ? <Remove onClick={onRemove} /> : undefined}
            <DragHandle dragListeners={handleListeners} px="5rem" />
          </div>
        ) : null}
        {placeholder ? children : <ul>{children}</ul>}
      </Component>
    );
  }
);
