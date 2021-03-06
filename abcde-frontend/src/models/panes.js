import { action } from "easy-peasy";

const panes = {
  vis: { overview: true, uiEditor: false },
  width: { overview: 320, uiEditor: 500 },
  isDragging: {overview: false, uiEditor: false},

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
};

export default panes;
