import assert from "node:assert/strict";

import { evaluate, labeledSelector, waitFor } from "./browser-page.mjs";
import {
  listSectionSelector,
  parameterDictionarySectionSelector,
} from "./param-dict-list.browser-support.mjs";

export async function emulateDarkMainReferencePresentation(client) {
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await waitFor(
    client,
    "the dark main-reference presentation",
    'document.querySelector(".setta-workspace.setta-workspace-dark") !== null',
  );
}

export async function assertParameterDictionaryMainPresentation(
  client,
  dictionaryId,
) {
  const sectionSelector = parameterDictionarySectionSelector(dictionaryId);
  const presentation = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const toolbar = section?.querySelector("[data-workspace-item-toolbar]");
      const label = toolbar?.querySelector(".setta-workspace-item-toolbar-label");
      const filter = toolbar?.querySelector(".setta-workspace-item-filter-input");
      const buttons = Array.from(toolbar?.querySelectorAll("button") ?? []);
      if (
        !(section instanceof HTMLElement) ||
        !(toolbar instanceof HTMLElement) ||
        !(label instanceof HTMLElement) ||
        !(filter instanceof HTMLInputElement)
      ) {
        return null;
      }
      const toolbarStyle = getComputedStyle(toolbar);
      const labelStyle = getComputedStyle(label);
      const filterStyle = getComputedStyle(filter);
      return {
        buttonLabels: buttons.map((button) => button.getAttribute("aria-label")),
        buttons: buttons.map((button) => {
          const style = getComputedStyle(button);
          return {
            backgroundColor: style.backgroundColor,
            borderWidth: style.borderWidth,
            height: style.height,
            width: style.width,
          };
        }),
        filter: {
          backgroundColor: filterStyle.backgroundColor,
          borderBottomWidth: filterStyle.borderBottomWidth,
          fontSize: filterStyle.fontSize,
        },
        glyphs: buttons.map((button) =>
          button.querySelector("i")?.className ?? "",
        ),
        label: {
          fontSize: labelStyle.fontSize,
          text: label.textContent?.trim() ?? "",
          textTransform: labelStyle.textTransform,
        },
        mode: toolbar.getAttribute("data-workspace-item-toolbar"),
        toolbar: {
          borderBottomWidth: toolbarStyle.borderBottomWidth,
          borderRadius: toolbarStyle.borderRadius,
          paddingLeft: toolbarStyle.paddingLeft,
          paddingRight: toolbarStyle.paddingRight,
        },
      };
    })()`,
  );

  assert.ok(presentation, "The Param Dict authoring toolbar is not mounted.");
  assert.equal(presentation.mode, "authoring-and-filter");
  assert.deepEqual(presentation.label, {
    fontSize: "12px",
    text: "Args",
    textTransform: "uppercase",
  });
  assert.deepEqual(presentation.buttonLabels, [
    "Remove last parameter",
    "Add parameter",
    "Delete selected parameters",
  ]);
  assert.deepEqual(presentation.glyphs, [
    "gg-math-minus before:!start-0",
    "gg-math-plus !scale-50",
    "gg-close !scale-50",
  ]);
  assert.deepEqual(presentation.toolbar, {
    borderBottomWidth: "1px",
    borderRadius: "12px",
    paddingLeft: "4px",
    paddingRight: "4px",
  });
  assert.equal(presentation.buttons.length, 3);
  for (const button of presentation.buttons) {
    assert.deepEqual(button, {
      backgroundColor: "rgba(0, 0, 0, 0)",
      borderWidth: "0px",
      height: "18px",
      width: "18px",
    });
  }
  assert.deepEqual(presentation.filter, {
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderBottomWidth: "1px",
    fontSize: "12px",
  });
}

export async function assertListRootMainPresentation(client, listId) {
  const sectionSelector = listSectionSelector(listId);
  const presentation = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector)});
      const incrementer = section?.querySelector(".python-canvas-list-incrementer");
      const icon = incrementer?.querySelector(".python-canvas-list-incrementer-icon");
      const label = incrementer?.querySelector(".python-canvas-list-incrementer-label");
      const input = incrementer?.querySelector(".python-canvas-list-incrementer-input");
      const remove = incrementer?.querySelector(${JSON.stringify(labeledSelector("Remove children"))});
      const add = incrementer?.querySelector(${JSON.stringify(labeledSelector("Add children"))});
      const minus = remove?.querySelector(".gg-math-minus");
      const plus = add?.querySelector(".gg-math-plus");
      if (
        !(incrementer instanceof HTMLElement) ||
        !(icon instanceof SVGElement) ||
        !(label instanceof HTMLElement) ||
        !(input instanceof HTMLInputElement) ||
        !(remove instanceof HTMLButtonElement) ||
        !(add instanceof HTMLButtonElement) ||
        !(minus instanceof HTMLElement) ||
        !(plus instanceof HTMLElement)
      ) {
        return null;
      }
      const incrementerStyle = getComputedStyle(incrementer);
      const iconStyle = getComputedStyle(icon);
      const labelStyle = getComputedStyle(label);
      const inputStyle = getComputedStyle(input);
      const buttonStyle = getComputedStyle(add);
      const incrementerRect = incrementer.getBoundingClientRect();
      const inputRect = input.getBoundingClientRect();
      const glyphRect = plus.getBoundingClientRect();
      return {
        button: {
          backgroundColor: buttonStyle.backgroundColor,
          borderWidth: buttonStyle.borderWidth,
          height: buttonStyle.height,
          width: buttonStyle.width,
        },
        glyph: { height: glyphRect.height, width: glyphRect.width },
        icon: {
          color: iconStyle.color,
          height: iconStyle.height,
          strokeWidth: icon.getAttribute("stroke-width"),
          width: iconStyle.width,
        },
        incrementer: {
          backgroundColor: incrementerStyle.backgroundColor,
          borderRadius: incrementerStyle.borderRadius,
          gap: incrementerStyle.gap,
          height: incrementerRect.height,
          marginLeft: incrementerStyle.marginLeft,
          marginRight: incrementerStyle.marginRight,
          paddingLeft: incrementerStyle.paddingLeft,
          paddingRight: incrementerStyle.paddingRight,
        },
        input: {
          appearance: inputStyle.appearance,
          backgroundColor: inputStyle.backgroundColor,
          borderWidth: inputStyle.borderWidth,
          fontSize: inputStyle.fontSize,
          height: inputRect.height,
          lineHeight: inputStyle.lineHeight,
          width: inputRect.width,
        },
        label: {
          color: labelStyle.color,
          fontSize: labelStyle.fontSize,
          fontWeight: labelStyle.fontWeight,
          text: label.textContent?.trim() ?? "",
        },
        text: { add: add.textContent, remove: remove.textContent },
      };
    })()`,
  );

  assert.ok(presentation, "The List of Objects incrementer is not mounted.");
  assert.deepEqual(presentation.incrementer, {
    backgroundColor: "rgb(6, 7, 10)",
    borderRadius: "8px",
    gap: "4px",
    height: 22,
    marginLeft: "-8px",
    marginRight: "-8px",
    paddingLeft: "8px",
    paddingRight: "4px",
  });
  assert.deepEqual(presentation.icon, {
    color: "rgb(65, 80, 108)",
    height: "16px",
    strokeWidth: "2",
    width: "16px",
  });
  assert.deepEqual(presentation.label, {
    color: "rgb(86, 105, 143)",
    fontSize: "10px",
    fontWeight: "700",
    text: "Children:",
  });
  assert.equal(presentation.input.appearance, "textfield");
  assert.equal(presentation.input.backgroundColor, "rgb(26, 33, 45)");
  assert.equal(presentation.input.borderWidth, "0px");
  assert.equal(presentation.input.fontSize, "12px");
  assert.equal(presentation.input.lineHeight, "16px");
  assert.ok(presentation.input.height <= 18);
  assert.ok(presentation.input.width <= 42);
  assert.deepEqual(presentation.button, {
    backgroundColor: "rgba(0, 0, 0, 0)",
    borderWidth: "0px",
    height: "22px",
    width: "22px",
  });
  assert.deepEqual(presentation.glyph, { height: 11, width: 11 });
  assert.deepEqual(presentation.text, { add: "", remove: "" });
}
