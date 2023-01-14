import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { SiteLogo } from "components/AppContainer/Header/SiteLogo";
import { login } from "dbRequests/authentication";
import { useFormik } from "formik";
import React, { useState } from "react";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { StandardButton } from "utils/atoms/buttons/StandardButton";

const LoginPage = () => {
  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);

  const { handleSubmit, handleChange, values, touched, errors, handleBlur } =
    useFormik({
      initialValues: {
        username: "",
        password: "",
      },
      onSubmit: ({ username, password }) => {
        login({ username, password });
      },
    });

  return (
    <GridWrapper gridStyles="bg-gray-300" flexFormWrap={true}>
      <div className="flex px-14 py-12 rounded-2xl border border-solid border-white shadow-2xl bg-white">
        <form className="grid gap-8 w-[400px]" onSubmit={handleSubmit}>
          <div className="grid place-items-center">
            <SiteLogo />
            <h1 className="font-heading text-gray-400 text-3xl font-bold ">Login</h1>
          </div>
          <div className="flex flex-col">
            <label className="text-xs">Username</label>
            <input
              id="username"
              name="username"
              placeholder="user@email.com"
              value={values.username}
              onChange={handleChange}
              onBlur={handleBlur}
              className="[border-width:0_0_2px_0] border-solid border-gray-100 py-2 focus-visible:border-blue-500"
            />
          </div>
          <div className="flex flex-col">
            <label className="text-xs ">Password</label>
            <div className="[&:has(input:focus-visible)]:border-blue-500 flex [border-width:0_0_2px_0] border-solid border-gray-100">
              <input
                id="password"
                name="password"
                placeholder="********"
                type={show ? "text" : "password"}
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur} 
                className="py-2 flex-grow"
              />
              <MenuBarButton onClick={handleClick}>
                {show ? "Hide" : "Show"}
              </MenuBarButton>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <StandardButton stdBtnStyles="w-full" inactive="bg-gray-400" text="text-white font-bold" hover="hover:bg-blue-500" type="submit">
              Login
            </StandardButton>
            <StandardButton stdBtnStyles="w-full border border-solid border-gray-400" inactive="bg-transparent"  hover="hover:bg-gray-200 hover:border-gray-200" type="submit">
              Register
            </StandardButton>
          </div>
          <a href="#" className="text-xs focus-visible:ring-2 hover:underline">I forgot my password.</a>
        </form>

      </div>
    </GridWrapper>
  );
};

export default React.memo(LoginPage);
