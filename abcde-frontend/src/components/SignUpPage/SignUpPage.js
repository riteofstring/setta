import React from "react";
import { useFormik } from "formik";
import {
  FormErrorMessage,
  FormLabel,
  FormControl,
  Flex,
  Text,
  Button,
  Input,
  Grid,
} from "@chakra-ui/react";
import * as Yup from "yup";

const SignUpPage = () => {
  const {
    handleSubmit,
    handleChange,
    values,
    touched,
    errors,
    handleBlur,
  } = useFormik({
    initialValues: {
      username: "",
      password: "",
    },
    validationSchema: Yup.object({
      email: Yup.string().email("Invalid email").required("Required"),
      username: Yup.string()
        .max(10, "Username must be shorter than 10 characters")
        .required("Required"),
      password: Yup.string()
        .min(6, "Password should be longer than 6 characters")
        .required(),
      confirmpassword: Yup.string().oneOf(
        [Yup.ref("password"), null],
        "Passwords must match"
      ),
    }),
    onSubmit: ({ username, password }) => {
      alert(`username: ${username}, password: ${password}`);
    },
  });

  return (
    <Flex
      flexDirection="column"
      width="800px"
      minHeight="200px"
      mt="200px"
      justifyContent="center"
      alignItems="center"
    >
      <Text fontSize="4xl" mb="1rem">
        Login
      </Text>
      <form onSubmit={handleSubmit}>
        <FormControl isInvalid={errors.username}>
          <Grid
            gap="1rem"
            templateColumns="[left] 0.25fr [middle] 0.75fr [right] 10vw [error]"
            mr="-10vw"
          >
            {/* email */}
            <FormLabel
              alignSelf="center"
              htmlFor="email"
              gridColumn="left/middle"
            >
              Email
            </FormLabel>

            <Input
              id="email"
              name="email"
              placeholder="email"
              w="300px"
              value={values.email}
              onChange={handleChange}
              onBlur={handleBlur}
              gridColumn="middle/right"
            />

            <FormErrorMessage gridColumn="right/error">
              {touched.email && errors.email ? (
                <Text>{errors.email}</Text>
              ) : null}
            </FormErrorMessage>

            {/* username */}
            <FormLabel
              alignSelf="center"
              htmlFor="username"
              gridColumn="left/middle"
            >
              Username
            </FormLabel>

            <Input
              id="username"
              name="username"
              placeholder="username"
              w="300px"
              value={values.username}
              onChange={handleChange}
              onBlur={handleBlur}
              gridColumn="middle/right"
            />

            <FormErrorMessage gridColumn="right/error">
              {touched.username && errors.username ? (
                <Text>{errors.username}</Text>
              ) : null}
            </FormErrorMessage>

            {/* password */}
            <FormLabel
              alignSelf="center"
              htmlFor="password"
              gridColumn="left/middle"
            >
              Password
            </FormLabel>
            <Input
              id="password"
              name="password"
              placeholder="password"
              value={values.password}
              onChange={handleChange}
              onBlur={handleBlur}
              w="300px"
              gridColumn="middle/right"
            />

            <FormErrorMessage gridColumn="right/error">
              {touched.password && errors.password ? (
                <Text>{errors.password}</Text>
              ) : null}
            </FormErrorMessage>

            {/* confirm password */}

            <Input
              id="confirmpassword"
              name="confirmpassword"
              placeholder="confirm password"
              value={values.confirmpassword}
              onChange={handleChange}
              onBlur={handleBlur}
              w="300px"
              gridColumn="middle/right"
            />

            <FormErrorMessage gridColumn="right/error">
              {touched.confirmpassword && errors.confirmpassword ? (
                <Text>{errors.password}</Text>
              ) : null}
            </FormErrorMessage>
            <Button
              alignSelf="flex-end"
              mt={4}
              colorScheme="teal"
              type="submit"
              gridColumn="middle/right"
            >
              Sign Up!
            </Button>
          </Grid>
        </FormControl>
      </form>
    </Flex>
  );
};

export default React.memo(SignUpPage);
