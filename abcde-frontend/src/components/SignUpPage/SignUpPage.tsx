import { GridWrapper } from "components/AppContainer/GridWrapper/GridWrapper";
import { register } from "dbRequests/authentication";
import { useFormik } from "formik";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { FormInput } from "utils/atoms/input/FormInput";
import { PasswordInput } from "utils/atoms/input/PasswordInput";
import { StandAloneInputContainer } from "utils/atoms/input/StandAloneInputContainer";
import * as Yup from "yup";

export function SignUpPage() {
  // touched, errors,
  const { handleSubmit, handleChange, values, handleBlur } = useFormik({
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
        password,
      });
    },
  });

  return (
    <GridWrapper gridStyles="bg-gray-400" flexFormWrap={true}>
      <StandAloneInputContainer
        onSubmit={handleSubmit}
        title="Sign Up"
        footer={<Footer />}
      >
        <FormInput
          label="Email"
          id="email"
          placeholder="user@email.com"
          value={values.email}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <FormInput
          label="Username"
          id="username"
          placeholder="username"
          value={values.username}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <PasswordInput
          id="password"
          placeholder="********"
          value={values.password}
          onChange={handleChange}
          onBlur={handleBlur}
        />
        <PasswordInput
          id="confirmpassword"
          label="Confirm Password"
          placeholder="********"
          value={values.confirmpassword}
          onChange={handleChange}
          onBlur={handleBlur}
        />
      </StandAloneInputContainer>
    </GridWrapper>
  );
}

function Footer() {
  return (
    <StandardButton
      align="self-stretch"
      inactive="bg-gray-400"
      text="text-white font-bold"
      hover="hover:bg-blue-500"
      type="submit"
    >
      Sign Up
    </StandardButton>
  );
}
