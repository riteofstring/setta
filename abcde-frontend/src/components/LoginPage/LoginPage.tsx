import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { SiteLogo } from "components/AppContainer/Header/SiteLogo";
import { login } from "dbRequests/authentication";
import { useFormik } from "formik";
import React, { useState } from "react";
import { MenuBarButton } from "utils/atoms/buttons/MenuBarButton";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { FormInput } from "utils/atoms/input/FormInput";
import { PasswordInput } from "utils/atoms/input/PasswordInput";

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
    <GridWrapper gridStyles="bg-gray-400" flexFormWrap={true}>
      <div className="flex px-14 py-12 rounded-2xl border border-solid border-white shadow-2xl bg-white">
        <form className="grid gap-8 w-[400px]" onSubmit={handleSubmit}>
          <div className="grid place-items-center">
            <SiteLogo />
            <h1 className="font-heading text-gray-600 text-3xl font-bold select-none">Login</h1>
          </div>
          <FormInput label="Username" id="username" placeholder="user@email.com" value={values.username} onChange={handleChange}
              onBlur={handleBlur} />
          <PasswordInput id="password"
                placeholder="********"
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}  />
          
          <div className="flex flex-col gap-2">
            <StandardButton align="self-stretch" inactive="bg-gray-400" text="text-white font-bold" hover="hover:bg-blue-500" type="submit">
              Login
            </StandardButton>
            <StandardButton type="button" stdBtnStyles="border border-solid border-gray-400" inactive="bg-transparent" align="self-stretch" hover="hover:bg-gray-200 hover:border-gray-200">
              Sign Up
            </StandardButton>
          </div>
          <a href="#" className="text-xs focus-visible:ring-2 hover:underline">I forgot my password.</a>
        </form>

      </div>
    </GridWrapper>
  );
};

export default React.memo(LoginPage);
