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

function removeLeadingZWNJ(str) {
  // Check if the string is composed entirely of ZWNJ characters
  if (!/^[\u200C]+$/.test(str)) {
    // Remove all leading ZWNJ characters
    return str.replace(/^[\u200C]+/, "");
  }
  // Return the original string if it's only ZWNJ characters
  return str;
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
  }

  saveCursorPosition = (element) => {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    const selectedObj = range.cloneContents();
    const temp = document.createElement("div");
    temp.appendChild(selectedObj);

    const childNodes = Array.prototype.slice.call(element.childNodes);
    let charCount = 0;
    let endNodeFound = false;
    childNodes.forEach((node) => {
      if (node === range.endContainer) endNodeFound = true;
      if (!endNodeFound) charCount += node.textContent.length;
    });

    return { html: temp.innerHTML, charCount: charCount + range.endOffset };
  };

  restoreCursorPosition = (element, savedPosition) => {
    if (!savedPosition) return;

    let charCount = 0;
    let node;
    const childNodes = Array.prototype.slice.call(element.childNodes);
    for (let i = 0; i < childNodes.length; i++) {
      node = childNodes[i];
      charCount += node.textContent.length;
      if (charCount >= savedPosition.charCount) {
        charCount -= node.textContent.length;
        break;
      }
    }

    const selection = window.getSelection();
    selection.removeAllRanges();
    const range = document.createRange();

    const offset = savedPosition.charCount - charCount;
    if (node.nodeType === Node.TEXT_NODE) {
      range.setStart(node, offset);
    } else {
      range.setStartBefore(node);
    }
    range.collapse(true);
    selection.addRange(range);
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

    function withVisibleUnicode(str) {
      // Replace invisible characters with a visible placeholder
      // Here, using [ZWNJ] to represent the ZWNJ character
      return str.replace(/\u200C/g, "[ZWNJ]");
    }

    // console.log("componentDidUpdate");
    // console.log("this.props.html", withVisibleUnicode(this.props.html));
    // console.log("el.innerHTML", withVisibleUnicode(el.innerHTML));

    // Perhaps React (whose VDOM gets outdated because we often prevent
    // rerendering) did not update the DOM. So we update it manually now.
    if (this.props.html !== el.innerHTML) {
      el.innerHTML = this.props.html;
    }
    this.lastHtml = this.props.html;
    // const savedPos = this.saveCursorPosition(el);
    // el.innerHTML = removeLeadingZWNJ(el.innerHTML);
    // this.restoreCursorPosition(el, savedPos);
  }

  emitChange = (originalEvt: React.SyntheticEvent<any>) => {
    const el = this.getEl();
    if (!el) return;

    const savedPos = this.saveCursorPosition(el);
    el.innerHTML = removeLeadingZWNJ(el.innerHTML);
    this.restoreCursorPosition(el, savedPos);

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

type ContentEditableEvent = React.SyntheticEvent<any, Event> & {
  target: { value: string };
};
type Modify<T, R> = Pick<T, Exclude<keyof T, keyof R>> & R;
type DivProps = Modify<
  JSX.IntrinsicElements["div"],
  { onChange: (event: ContentEditableEvent) => void }
>;

interface Props extends DivProps {
  html: string;
  contentEditable?: any;
  tagName?: string;
  className?: string;
  style?: Object;
  innerRef?: React.RefObject<HTMLElement> | Function;
}
