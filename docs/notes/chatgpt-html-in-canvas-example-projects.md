HTML-in-Canvas is the experimental Chromium/WICG feature for rendering DOM into Canvas/WebGL/WebGPU using primitives such as `layoutsubtree`, `drawElementImage`, `texElementImage2D`, and `copyElementImageToTexture`; expect Chrome Canary/Chromium and the `canvas-draw-element` flag for many of these. ([Chrome for Developers][1])

1. **felixturner/html-in-canvas-cracks** — Probably the most spectacular one: live HTML becomes a WebGPU/TSL texture, then clicks “crack” the page into animated 3D shards with feedback trails and scrolling DOM still involved. ([GitHub][2])

2. **SawyerHood/html-in-canvas-room** — A Chrome extension that renders webpages onto a 3D CRT monitor in a first-person room, with WASD/mouse movement and click/scroll/type forwarding back to the page. ([GitHub][3])

3. **MaxLeiter/compiz-web** — Shader-driven webpage transitions inspired by Compiz: old and new pages are captured as live textures and composited through WebGL fragment shaders. ([GitHub][4])

4. **repalash/three-html-render** — A serious library/polyfill for live interactive HTML textures in Three.js/WebGL/WebGPU/2D canvas, including native HTML-in-canvas fast paths plus demos for WebXR, WebGPU, inputs, focus rings, charts, and complex text. ([GitHub][5])

5. **tomasferrerasdev/try-html-in-canvas** — A browser extension that applies custom GLSL shaders to live webpages by moving the page into a `layoutsubtree`, rasterizing it, and uploading it to WebGL2; includes displacement/page-roll style effects. ([GitHub][6])

6. **zen1975/html-in-canvas-demo** — A focused “water drop” shader demo: ray-traced WebGL water distortion over an actual clickable HTML card using HTML-in-canvas texture capture. ([GitHub][7])

7. **mrdoob/three.js — `webgl_materials_texture_html`** — The official Three.js HTMLTexture example maps live DOM onto a 3D rounded box, including rich text, emoji, RTL/vertical text, images, SVG, input, button, and interaction handling. ([GitHub][8])

8. **en-dash-consulting/html-in-canvas-dot-dev** — The `html-in-canvas.dev` demo/gallery repo. The gallery includes page curl, pixel disintegration, frosted/liquid glass, elastic bulge, CSS-to-shader pipeline, rich text editor, accessible charts, export/video recording, and more. ([GitHub][9])

9. **zumerlab/snapdom** — More practical than flashy: a DOM-to-image/export engine with an official `html-in-canvas` exporter that uses the experimental `drawElementImage` path where available instead of traditional screenshot/serialization hacks. ([GitHub][10])

10. **WICG/html-in-canvas examples** — The canonical proposal repo’s examples are still worth checking: interactive text input, WebGL HTML texture upload, accessible pie chart labels/focus behavior, and complex text rendering with emoji/RTL/CJK-style cases. ([GitHub][11])

The three I’d run first are **html-in-canvas-cracks**, **html-in-canvas-room**, and **compiz-web**; they best show why this feature is more than “screenshots of DOM.”

[1]: https://developer.chrome.com/blog/chrome-148-beta?utm_source=chatgpt.com "Chrome 148 beta | Blog"
[2]: https://github.com/felixturner/html-in-canvas-cracks "GitHub - felixturner/html-in-canvas-cracks: Real HTML rendered through a WebGPU + TSL pipeline — DOM as a texture source with live post-processing. · GitHub"
[3]: https://github.com/SawyerHood/html-in-canvas-room "GitHub - SawyerHood/html-in-canvas-room · GitHub"
[4]: https://github.com/MaxLeiter/compiz-web "GitHub - MaxLeiter/compiz-web: html-in-canvas demo for page transitions · GitHub"
[5]: https://github.com/repalash/three-html-render "GitHub - repalash/three-html-render: HTML rendering in webgl/three.js · GitHub"
[6]: https://github.com/tomasferrerasdev/try-html-in-canvas "GitHub - tomasferrerasdev/try-html-in-canvas · GitHub"
[7]: https://github.com/zen1975/html-in-canvas-demo "GitHub - zen1975/html-in-canvas-demo: html-in-canvas experiment: Ray-traced WebGL water drop with interactive HTML — texElementImage2D + layoutsubtree · GitHub"
[8]: https://github.com/mrdoob/three.js/blob/dev/examples/webgl_materials_texture_html.html "three.js/examples/webgl_materials_texture_html.html at dev · mrdoob/three.js · GitHub"
[9]: https://github.com/en-dash-consulting/html-in-canvas-dot-dev "GitHub - en-dash-consulting/html-in-canvas-dot-dev · GitHub"
[10]: https://github.com/zumerlab/snapdom "GitHub - zumerlab/snapdom: SnapDOM: DOM to anything engine — fast, modular, extensible. · GitHub"
[11]: https://github.com/WICG/html-in-canvas "GitHub - WICG/html-in-canvas · GitHub"
