import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { useFormik } from "formik";
import React, { useState } from "react";
import { login } from "thunks/authentication";

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
    <GridWrapper flexFormWrap={true}>
      <p className="mb-4 text-4xl">Login</p>
      <form onSubmit={handleSubmit}>
        <div className="-mr[10vw] gap-4">
          <p className="self-center ">Username</p>
          <input
            id="username"
            name="username"
            placeholder="username"
            value={values.username}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-80"
          />
          <p className="self-center ">Password</p>
          <div className="w-96">
            <input
              id="password"
              name="password"
              placeholder="password"
              type={show ? "text" : "password"}
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              className="w-80"
            />
            <button className="h-7 text-sm" onClick={handleClick}>
              {show ? "Hide" : "Show"}
            </button>
          </div>
          <button
            className="mt-4 self-end"
            type="submit"
            style={{ gridColumn: "middle/right" }}
          >
            Login
          </button>
        </div>
      </form>
    </GridWrapper>
  );
};

export default React.memo(LoginPage);
