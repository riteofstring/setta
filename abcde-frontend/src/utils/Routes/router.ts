import { createBrowserRouter } from "react-router-dom";
import { indexRoute } from "./indexRoute";
import { signUpRoute } from "./signUp";

export const router = createBrowserRouter([indexRoute, signUpRoute]);
