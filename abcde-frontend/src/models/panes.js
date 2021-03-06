import { action } from "easy-peasy";

const panes = {
  vis: { overview: true, uiEditor: false },
  width: { overview: 320, uiEditor: 500 },
  cssWidth: { overview: "320px", uiEditor: "2.5rem" },
  isDragging: { overview: false, uiEditor: false },

  setVis: action((state, payload) => {
    const { paneName, vis } = payload;
    state.vis[paneName] = vis;
  }),

  setWidth: action((state, payload) => {
    const { paneName, width } = payload;
    state.width[paneName] = width;
  }),

  setIsDragging: action((state, payload) => {
    const { paneName, isDragging } = payload;
    state.isDragging[paneName] = isDragging;
  }),

  setCssWidth: action((state, payload) => {
    const { paneName, cssWidth } = payload;
    console.log("cssWidth", cssWidth)
    state.cssWidth[paneName] = cssWidth;
  }),
};

export default panes;
