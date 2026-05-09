Yes, but **selectively**. Architecture 3 should not become “use a big canvas framework and hope it fits.” Its core value is that Setta owns the scene graph, retained parameter hit records, DOM islands, texture scheduling, and pan/zoom invariants. The architecture explicitly expects retained parameter content surfaces, DOM islands for native controls, custom retained-content interaction, and no dnd-kit path for retained param DnD. 

## Recommended libraries

| Area                                           | Recommendation                                        | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **WebGPU math**                                | **`wgpu-matrix`**                                     | Good fit. It is designed around WebGPU coordinate conventions, including WebGPU’s 0-to-1 clip-space Z and WebGPU matrix padding details. Use it for camera, projection, quad, clip, and transform math. ([wgpu-matrix][1])                                                                                                                                                                                                                          |
| **WebGPU type safety / resource ergonomics**   | **Evaluate `typegpu`, do not commit immediately**     | TypeGPU provides type-safe, declarative WebGPU resource/shader tooling. It may help reduce WGSL/resource bugs, but it adds build-tool coupling, so I would prototype it in one renderer module first. ([Software Mansion][2])                                                                                                                                                                                                                       |
| **Spatial hit testing**                        | **`rbush` first; `flatbush` optionally**              | Retained rows, ports, resize handles, drop markers, and section hit rects need fast spatial lookup. `rbush` is a high-performance JS R-tree for 2D rectangles and points; `flatbush` is better when you rebuild a mostly static index per frame or per scene commit. ([npm][3])                                                                                                                                                                     |
| **DOM island popovers / dropdown positioning** | **Floating UI**                                       | Use it for tooltip, popover, dropdown, validation bubble, and DOM-island collision/flip/offset behavior. Floating UI is explicitly built for positioning floating elements such as tooltips, popovers, and dropdowns. ([Floating UI][4])                                                                                                                                                                                                            |
| **Accessible DOM island controls**             | **React Aria or Radix Primitives**                    | Use one of these for native DOM islands, not for retained canvas rows. React Aria is lower-level and strong if you need custom DOM/control behavior; Radix is faster if your design system already matches its primitives. React Aria provides accessible hooks/components with keyboard, screen-reader, and interaction behavior; Radix Primitives provide accessible low-level React components aligned with WAI-ARIA patterns. ([React Aria][5]) |
| **Nested/flex-like layout**                    | **Yoga only if layout rules become hard to maintain** | Yoga is an embeddable flexbox layout engine. It could help if nested section layout becomes a real constraint solver problem, but I would not add it unless your custom `sceneLayout.ts` starts duplicating flexbox. ([GitHub][6])                                                                                                                                                                                                                  |
| **Auto-layout / graph layout**                 | **ELK.js, not Dagre, for advanced layout**            | ELK.js is the better candidate for serious node/port-aware auto-layout. Dagre is fine for simple directed graph layout, but ELK’s documentation describes broader diagram layout infrastructure and standard algorithms. ([GitHub][7])                                                                                                                                                                                                              |
| **State store**                                | **Keep Zustand; optionally add Immer locally**        | Zustand fits viewport/layout/interaction stores because it is small, fast, and not opinionated. Immer can help only where reducer-style scene patches become hard to read. ([Zustand Documentation][8])                                                                                                                                                                                                                                             |
| **E2E testing**                                | **Playwright**                                        | Architecture 3 needs browser-level tests for pointer capture, focus handoff, DOM island activation, wheel zoom, keyboard navigation, text input, and file/dropzone behavior. Playwright drives Chromium, Firefox, and WebKit with one API. ([Playwright][9])                                                                                                                                                                                        |
| **Accessibility regression testing**           | **`@axe-core/playwright` / `axe-core`**               | Use this around DOM islands, focus order, menus, dialogs, labels, and generated accessibility mirrors. Axe-core is an accessibility testing engine for HTML-based UIs, and Playwright documents integration with `@axe-core/playwright`. ([npm][10])                                                                                                                                                                                                |
| **Invariant/property testing**                 | **`fast-check`**                                      | Strong fit for coordinate transforms, visible-index-to-full-index insertion mapping, drag/drop legality, clipping, scroll math, and no-op/drop-descendant rejection. `fast-check` is a property-based testing framework for JS/TS. ([Fast Check][11])                                                                                                                                                                                               |

## Libraries I would not use as the core

**Do not use React Flow / XYFlow.** Architecture 3 is explicitly replacing that class of DOM/graph surface. Reintroducing it would undermine the scene ownership model.

**Do not use dnd-kit for retained parameter drag/drop.** Architecture 3 specifically moves retained parameter drag/drop into retained-content interaction and says not to use dnd-kit for that surface. 

**Do not make PixiJS the core renderer.** PixiJS v8 is a mature 2D renderer with optional WebGPU/WebGL support, and it could be useful for experiments or isolated overlay prototypes. But Setta’s core compositor has special requirements: html-in-canvas texture upload, retained parameter surfaces, DOM island projection, custom texture budgets, and strict transform-only pan/zoom. Those should remain custom. ([PixiJS][12])

**Do not use Konva/Fabric-style scene frameworks for retained params unless you are willing to lose control.** The retained parameter surface is mostly rows, labels, ports, scrollbars, drop markers, and hit records. A custom retained row renderer plus `rbush`/`flatbush` is likely simpler and faster than adapting a general canvas object model.

## My suggested stack

Use this as the default Architecture 3 dependency set:

```text
Core renderer:
  raw WebGPU + WGSL
  wgpu-matrix
  optional typegpu experiment

Scene / hit testing:
  rbush
  optional flatbush for static rebuilt indexes

DOM islands:
  React Aria or Radix Primitives
  Floating UI

Layout:
  custom sceneLayout.ts first
  Yoga only if flex-like layout complexity grows
  ELK.js only for auto-layout features

State:
  Zustand
  optional Immer for local patch reducers

Testing:
  Playwright
  @axe-core/playwright
  fast-check
```

## Final recommendation

The most valuable additions are **`wgpu-matrix`, `rbush`, Floating UI, React Aria/Radix, Playwright, axe-core, and fast-check**.

The most important non-addition is: **do not adopt a general canvas scene framework as the owner of Architecture 3**. Keep Setta’s scene graph, retained parameter model, DOM island lifecycle, and texture scheduling custom.

[1]: https://wgpu-matrix.org/docs/?utm_source=chatgpt.com "Why another 3d math library? - wgpu-matrix"
[2]: https://docs.swmansion.com/TypeGPU/?utm_source=chatgpt.com "TypeGPU – Type-safe WebGPU toolkit"
[3]: https://www.npmjs.com/package/rbush?utm_source=chatgpt.com "rbush"
[4]: https://floating-ui.com/docs/getting-started?utm_source=chatgpt.com "Getting Started"
[5]: https://react-aria.adobe.com/?utm_source=chatgpt.com "React Aria - Adobe"
[6]: https://github.com/facebook/yoga?utm_source=chatgpt.com "facebook/yoga: Yoga is an embeddable layout engine ..."
[7]: https://github.com/kieler/elkjs?utm_source=chatgpt.com "kieler/elkjs: ELK's layout algorithms for JavaScript"
[8]: https://zustand.docs.pmnd.rs/?utm_source=chatgpt.com "Zustand: Introduction"
[9]: https://playwright.dev/?utm_source=chatgpt.com "Playwright: Fast and reliable end-to-end testing for modern ..."
[10]: https://www.npmjs.com/package/axe-core?utm_source=chatgpt.com "axe-core"
[11]: https://fast-check.dev/?utm_source=chatgpt.com "fast-check official documentation | fast-check"
[12]: https://pixijs.com/8.x/guides/getting-started/intro?utm_source=chatgpt.com "Introduction | PixiJS"
