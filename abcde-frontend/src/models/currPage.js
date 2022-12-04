import { action } from "easy-peasy";
import { LOGIN } from "utils/pageNames";

const currPage = {
  name: LOGIN,

  setName: action((state, payload) => {
    state.name = payload;
  }),
};

export default currPage;
