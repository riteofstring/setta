import { useFormik } from "formik";
import { login } from "thunks/user/login";
import { StandardButton } from "utils/atoms/buttons/StandardButton";
import { FormInput } from "utils/atoms/input/FormInput";
import { PasswordInput } from "utils/atoms/input/PasswordInput";
import { StandAloneInputContainer } from "utils/atoms/input/StandAloneInputContainer";
import { GridWrapper } from "utils/Wrappers/GridWrapper";

export function LoginPage() {
  // touched, errors,
  const { handleSubmit, handleChange, values, handleBlur } = useFormik({
    initialValues: {
      username: "",
      password: "",
    },
    onSubmit: login,
  });

  return (
    <GridWrapper
      gridStyles="bg-slate-400 dark:bg-slate-800"
      flexFormWrap={true}
    >
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
        inactive="bg-slate-400 dark:bg-slate-800"
        text="text-white font-bold"
        hover="hover:bg-blue-500"
        type="submit"
      >
        Login
      </StandardButton>
      <StandardButton
        type="button"
        stdBtnStyles="border border-solid border-slate-400"
        inactive="bg-transparent"
        align="self-stretch"
        hover="hover:bg-slate-200 hover:border-slate-200"
      >
        Sign Up
      </StandardButton>
      <a href="#" className="text-xs hover:underline focus-visible:ring-2">
        I forgot my password.
      </a>
    </>
  );
}
