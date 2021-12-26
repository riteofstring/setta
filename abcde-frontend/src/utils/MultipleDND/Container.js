import classNames from "classnames";
import { useStoreActions } from "easy-peasy";
import React, { forwardRef } from "react";
import { Menu, Item, useContextMenu } from "react-contexify";
import "react-contexify/dist/ReactContexify.css";

import { DragHandle } from "../DragHandle/DragHandle";
import styles from "./Container.module.css";
import { Remove } from "./Remove";

export const Container = forwardRef(
  (
    {
      id,
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
    const { show } = useContextMenu({ id });

    function displayMenu(e) {
      show(e);
    }

    const Component = onClick ? "button" : "div";

    return (
      <>
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
          onContextMenu={displayMenu}
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
        <SectionGroupMenu groupId={id} />
      </>
    );
  }
);

function SectionGroupMenu({ groupId }) {
  const addSection = useStoreActions((x) => x.master.addSection);
  const setOneGroupChildren = useStoreActions(
    (x) => x.master.setOneGroupChildren
  );
  const setGroupsHaveUpdated = useStoreActions(
    (x) => x.master.setGroupsHaveUpdated
  );

  function newSectionClick({ triggerEvent }) {
    const { clientX, clientY } = triggerEvent;
    const newIds = addSection({});
    setOneGroupChildren({
      groupId,
      newStateFn: (x) => [...newIds, ...x],
    });
    setGroupsHaveUpdated(true);
  }
  return (
    <Menu id={groupId}>
      <Item onClick={newSectionClick}>New Section</Item>
    </Menu>
  );
}
