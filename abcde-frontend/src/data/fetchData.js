import axios from "axios";

const BACKEND = "http://localhost:8000/";

export const getUISpecs = () => {
    return axios.get(BACKEND.concat("api/ui_specs"))
};
