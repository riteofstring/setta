import deepEqual from "fast-deep-equal";
import PropTypes from "prop-types";
import React from "react";
import "./contenteditable.css";

// https://github.com/lovasoa/react-contenteditable
// https://github.com/lovasoa/react-contenteditable/issues/161#issuecomment-669633470
export const ContentEditable = React.forwardRef(
  (
    { onChange, onInput, onBlur, onKeyPress, onKeyDown, onClick, ...props },
    ref
  ) => {
    const onChangeRef = React.useRef(onChange);
    const onInputRef = React.useRef(onInput);
    const onBlurRef = React.useRef(onBlur);
    const onKeyPressRef = React.useRef(onKeyPress);
    const onKeyDownRef = React.useRef(onKeyDown);
    const onClickRef = React.useRef(onClick);

    React.useEffect(() => {
      onChangeRef.current = onChange;
    }, [onChange]);
    React.useEffect(() => {
      onInputRef.current = onInput;
    }, [onInput]);
    React.useEffect(() => {
      onBlurRef.current = onBlur;
    }, [onBlur]);
    React.useEffect(() => {
      onKeyPressRef.current = onKeyPress;
    }, [onKeyPress]);
    React.useEffect(() => {
      onKeyDownRef.current = onKeyDown;
    }, [onKeyDown]);
    React.useEffect(() => {
      onClickRef.current = onClick;
    }, [onClick]);

    return (
      <ReactContentEditable
        {...props}
        innerRef={ref}
        onChange={
          onChange
            ? (...args) => {
                if (onChangeRef.current) {
                  onChangeRef.current(...args);
                }
              }
            : undefined
        }
        onInput={
          onInput
            ? (...args) => {
                if (onInputRef.current) {
                  onInputRef.current(...args);
                }
              }
            : undefined
        }
        onBlur={
          onBlur
            ? (...args) => {
                if (onBlurRef.current) {
                  onBlurRef.current(...args);
                }
              }
            : undefined
        }
        onKeyPress={
          onKeyPress
            ? (...args) => {
                if (onKeyPressRef.current) {
                  onKeyPressRef.current(...args);
                }
              }
            : undefined
        }
        onKeyDown={
          onKeyDown
            ? (...args) => {
                if (onKeyDownRef.current) {
                  onKeyDownRef.current(...args);
                }
              }
            : undefined
        }
        onClick={
          onClick
            ? (...args) => {
                if (onClickRef.current) {
                  onClickRef.current(...args);
                }
              }
            : undefined
        }
      />
    );
  }
);

function normalizeHtml(str: string): string {
  return (
    str && str.replace(/&nbsp;|\u202F|\u00A0/g, " ").replace(/<br \/>/g, "<br>")
  );
}

function replaceCaret(el: HTMLElement) {
  // Place the caret at the end of the element
  const target = document.createTextNode("");
  el.appendChild(target);
  // do not move caret if element was not focused
  const isTargetFocused = document.activeElement === el;
  if (target !== null && target.nodeValue !== null && isTargetFocused) {
    var sel = window.getSelection();
    if (sel !== null) {
      var range = document.createRange();
      range.setStart(target, target.nodeValue.length);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
    if (el instanceof HTMLElement) el.focus();
  }
}

/**
 * A simple component for an html element with editable contents.
 */
class ReactContentEditable extends React.Component<Props> {
  lastHtml: string = this.props.html;
  el: any =
    typeof this.props.innerRef === "function"
      ? { current: null }
      : React.createRef<HTMLElement>();

  constructor(props) {
    super(props);
    this.cursorInfo = 0;
  }

  saveCursorPosition = (element) => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return;

    const range = selection.getRangeAt(0);
    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(element);
    preCaretRange.setEnd(range.endContainer, range.endOffset);
    this.cursorOffset = preCaretRange.toString().length;
  };

  restoreCursorPosition = (element) => {
    const selection = window.getSelection();
    if (!selection) return;

    let charCount = 0;
    const walkNodes = (parentNode) => {
      for (
        let node = parentNode.firstChild;
        node != null;
        node = node.nextSibling
      ) {
        if (node.nodeType === Node.TEXT_NODE) {
          // Text node
          if (charCount + node.length >= this.cursorOffset) {
            selection.removeAllRanges();
            const range = document.createRange();
            range.setStart(node, this.cursorOffset - charCount);
            range.collapse(true);
            selection.addRange(range);
            return true; // Stop the recursion
          }
          charCount += node.length;
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          // Element node
          if (walkNodes(node)) return true; // Stop traversing if cursor position is found
        }
      }
      return false; // Continue traversal
    };

    walkNodes(element);
  };

  getEl = () =>
    (this.props.innerRef && typeof this.props.innerRef !== "function"
      ? this.props.innerRef
      : this.el
    ).current;

  render() {
    const { tagName, html, innerRef, ...props } = this.props;

    return React.createElement(
      tagName || "div",
      {
        ...props,
        ref:
          typeof innerRef === "function"
            ? (current: HTMLElement) => {
                innerRef(current);
                this.el.current = current;
              }
            : innerRef || this.el,
        onInput: this.emitChange,
        onBlur: this.props.onBlur || this.emitChange,
        onKeyUp: this.props.onKeyUp || this.emitChange,
        onKeyDown: this.props.onKeyDown || this.emitChange,
        contentEditable: this.props.contentEditable,
        dangerouslySetInnerHTML: { __html: html },
      },
      this.props.children
    );
  }

  shouldComponentUpdate(nextProps: Props): boolean {
    const { props } = this;
    const el = this.getEl();

    // We need not rerender if the change of props simply reflects the user's edits.
    // Rerendering in this case would make the cursor/caret jump

    // Rerender if there is no element yet... (somehow?)
    if (!el) return true;

    // ...or if html really changed... (programmatically, not by user edit)
    if (normalizeHtml(nextProps.html) !== normalizeHtml(el.innerHTML)) {
      return true;
    }

    // Handle additional properties
    // Commented out innerRef comparison because it was causing issues with cursor location.
    // Seems to work for now?!
    return (
      props.contentEditable !== nextProps.contentEditable ||
      props.tagName !== nextProps.tagName ||
      props.className !== nextProps.className ||
      // props.innerRef !== nextProps.innerRef ||
      props.placeholder !== nextProps.placeholder ||
      !deepEqual(props.style, nextProps.style)
    );
  }

  componentDidUpdate() {
    const el = this.getEl();
    if (!el) return;

    // Perhaps React (whose VDOM gets outdated because we often prevent
    // rerendering) did not update the DOM. So we update it manually now.
    if (this.props.html !== el.innerHTML) {
      el.innerHTML = this.props.html;
    }
    this.lastHtml = this.props.html;
    // replaceCaret(el);
    this.restoreCursorPosition(el);
  }

  emitChange = (originalEvt: React.SyntheticEvent<any>) => {
    const el = this.getEl();
    if (!el) return;

    const html = el.innerHTML;
    if (this.props.onChange && html !== this.lastHtml) {
      // Clone event with Object.assign to avoid
      // "Cannot assign to read only property 'target' of object"
      const evt = Object.assign({}, originalEvt, {
        target: {
          value: html,
        },
      });
      this.props.onChange(evt);
    }
    this.lastHtml = html;
    this.saveCursorPosition(el);
  };

  static propTypes = {
    html: PropTypes.string.isRequired,
    onChange: PropTypes.func,
    contentEditable: PropTypes.any,
    tagName: PropTypes.string,
    className: PropTypes.string,
    style: PropTypes.object,
    innerRef: PropTypes.oneOfType([PropTypes.object, PropTypes.func]),
  };
}

export type ContentEditableEvent = React.SyntheticEvent<any, Event> & {
  target: { value: string };
};
type Modify<T, R> = Pick<T, Exclude<keyof T, keyof R>> & R;
type DivProps = Modify<
  JSX.IntrinsicElements["div"],
  { onChange: (event: ContentEditableEvent) => void }
>;

export interface Props extends DivProps {
  html: string;
  contentEditable?: any;
  tagName?: string;
  className?: string;
  style?: Object;
  innerRef?: React.RefObject<HTMLElement> | Function;
}
