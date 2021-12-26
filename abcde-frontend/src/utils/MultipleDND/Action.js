import classNames from "classnames";
import React from "react";

import styles from "./Action.module.css";

export function Action({ active, className, cursor, style, ...props }) {
  return (
    <button
      {...props}
      className={classNames(styles.Action, className)}
      tabIndex={0}
      style={{
        ...style,
        cursor,
        "--fill": active?.fill,
        "--background": active?.background,
      }}
    />
  );
}
