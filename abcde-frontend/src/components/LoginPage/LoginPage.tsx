import { GridWrapper } from "components/AppContainer/GridWrapper/GridWrapper";
import { login } from "dbRequests/authentication";
import { useFormik } from "formik";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { FormInput } from "utils/atoms/input/FormInput";
import { PasswordInput } from "utils/atoms/input/PasswordInput";
import { StandAloneInputContainer } from "utils/atoms/input/StandAloneInputContainer";

export function LoginPage() {
  // touched, errors,
  const { handleSubmit, handleChange, values, handleBlur } = useFormik({
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
      <StandAloneInputContainer
        onSubmit={handleSubmit}
        title="Login"
        footer={<Footer />}
      >
        <FormInput
          label="Username"
          id="username"
          placeholder="user@email.com"
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
      </StandAloneInputContainer>
    </GridWrapper>
  );
}

function Footer() {
  return (
    <>
      <StandardButton
        align="self-stretch"
        inactive="bg-gray-400"
        text="text-white font-bold"
        hover="hover:bg-blue-500"
        type="submit"
      >
        Login
      </StandardButton>
      <StandardButton
        type="button"
        stdBtnStyles="border border-solid border-gray-400"
        inactive="bg-transparent"
        align="self-stretch"
        hover="hover:bg-gray-200 hover:border-gray-200"
      >
        Sign Up
      </StandardButton>
      <a href="#" className="text-xs focus-visible:ring-2 hover:underline">
        I forgot my password.
      </a>
    </>
  );
}
