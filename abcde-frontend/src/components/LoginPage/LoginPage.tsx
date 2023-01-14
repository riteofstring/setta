import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
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

    // [border-width:0_0_1px_0]

  return (
    <GridWrapper  flexFormWrap={true}>
      
      <form className="grid gap-2 w-[clamp(400px, 80vw, 960px)] px-14 py-12 rounded-2xl border border-solid border-white shadow-2xl" onSubmit={handleSubmit}>
      <h1 className="font-heading text-gray-500 text-4xl">Login</h1>
          {/* <label className="self-center text-xs">Username</label> */}
          <input
            id="username"
            name="username"
            placeholder="username"
            value={values.username}
            onChange={handleChange}
            onBlur={handleBlur}
            className="border border-solid border-gray-100 py-2 px-4 rounded-full"
          />
          {/* <label className="self-center text-xs ">Password</label> */}
          <div className="border border-solid border-gray-100 py-2 px-4 rounded-full">
            <input
              id="password"
              name="password"
              placeholder="password"
              type={show ? "text" : "password"}
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              
            />
            <MenuBarButton onClick={handleClick}>
              {show ? "Hide" : "Show"}
            </MenuBarButton>
          </div>
          <StandardButton type="submit">
            Login
          </StandardButton>

      </form>
    </GridWrapper>
  );
};

export default React.memo(LoginPage);
