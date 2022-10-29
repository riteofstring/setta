import { action } from "easy-peasy";

const panes = {
  vis: { overview: true, uiEditor: false },
  width: { overview: 320, uiEditor: 500 },
  trueWidth: { overview: 320, uiEditor: 40 },

  setVis: action((state, payload) => {
    const { paneName, vis } = payload;
    state.vis[paneName] = vis;
  }),

  setWidth: action((state, payload) => {
    const { paneName, width } = payload;
    state.width[paneName] = width;
  }),

  setTrueWidth: action((state, payload) => {
    const { paneName, trueWidth } = payload;
    state.trueWidth[paneName] = trueWidth;
  }),
};

export default panes;
