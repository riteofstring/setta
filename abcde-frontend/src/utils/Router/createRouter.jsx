import App from "App";
import LoginPage from "components/LoginPage/LoginPage";
import SignUpPage from "components/SignUpPage/SignUpPage";
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
} from "react-router-dom";

export const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/" element={<LoginPage />} />
      <Route path="signup" element={<SignUpPage />} />
      <Route path="projects" element={<App />} />
    </>
  )
);
