import { action } from "easy-peasy";

const panes = {
  vis: { overview: true, uiEditor: false },
  width: { overview: 320, uiEditor: 500 },

  setVis: action((state, payload) => {
    const { paneName, vis } = payload;
    state.vis[paneName] = vis;
  }),

  setWidth: action((state, payload) => {
    const { paneName, width } = payload;
    state.width[paneName] = width;
  }),
};

export default panes;
