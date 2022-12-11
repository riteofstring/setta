import GridWrapper from "components/AppContainer/GridWrapper/GridWrapper";
import { register } from "dbRequests/authentication.js";
import { useFormik } from "formik";
import { useAuth } from "models/auth";
import React from "react";
import * as Yup from "yup";

const SignUpPage = () => {
  const actionLoginSuccess = useAuth((x) => x.loginSuccess);
  const actionLoginFail = useAuth((x) => x.loginFail);

  const { handleSubmit, handleChange, values, touched, errors, handleBlur } =
    useFormik({
      initialValues: {
        email: "",
        username: "",
        password: "",
        confirmpassword: "",
      },
      validationSchema: Yup.object({
        email: Yup.string().email("Invalid email").required("Required"),
        username: Yup.string()
          .max(10, "Username must be shorter than 10 characters")
          .required("Required"),
        password: Yup.string()
          .min(3, "Password should be longer than 3 characters")
          .required(),
        confirmpassword: Yup.string().oneOf(
          [Yup.ref("password"), null],
          "Passwords must match"
        ),
      }),
      onSubmit: ({ email, username, password }) => {
        // alert(`email: ${email}, username: ${username}, password: ${password}`);
        register({
          username,
          email,
          password,
          actionLoginSuccess,
          actionLoginFail,
        });
      },
    });

  return (
    <GridWrapper flexFormWrap={true}>
      <p className="mb-4 text-4xl">Sign Up</p>
      <form onSubmit={handleSubmit}>
        <div className="-mr[10vw] gap-4">
          <p className="self-center ">Email</p>

          <input
            id="email"
            name="email"
            placeholder="email"
            value={values.email}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-80"
          />
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
          <input
            id="password"
            name="password"
            placeholder="password"
            value={values.password}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-80"
          />
          <input
            id="confirmpassword"
            name="confirmpassword"
            placeholder="confirm password"
            value={values.confirmpassword}
            onChange={handleChange}
            onBlur={handleBlur}
            className="w-80"
          />
          <button className="mt-4 self-end" type="submit">
            Sign Up
          </button>
        </div>
      </form>
    </GridWrapper>
  );
};

export default React.memo(SignUpPage);
