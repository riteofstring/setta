import React, { useState } from "react";
import { useFormik } from "formik";
import { useHistory } from "react-router-dom";
import {
  FormErrorMessage,
  FormLabel,
  FormControl,
  Flex,
  Text,
  Button,
  InputGroup,
  Input,
  InputRightElement,
  Grid,
} from "@chakra-ui/react";
import { useStoreActions } from "easy-peasy";
import { login } from "../../dbRequests/authentication.js";

const LoginPage = () => {
  let history = useHistory();

  const actionLoginSuccess = useStoreActions(
    (actions) => actions.auth.loginSuccess
  );
  const actionLoginFail = useStoreActions((actions) => actions.auth.loginFail);

  const [show, setShow] = useState(false);
  const handleClick = () => setShow(!show);

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
    onSubmit: ({ username, password }) => {
      // alert(`username: ${username}, password: ${password}`);
      login({
        username,
        password,
        actionLoginSuccess,
        actionLoginFail,
      }).then((x) => {
        if (x) {
          history.push("/");
        }
      });
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
            <InputGroup gridColumn="middle/right">
              <Input
                id="password"
                name="password"
                placeholder="password"
                type={show ? "text" : "password"}
                value={values.password}
                onChange={handleChange}
                onBlur={handleBlur}
                w="300px"
              />
              <InputRightElement width="4.5rem">
                <Button h="1.75rem" size="sm" onClick={handleClick}>
                  {show ? "Hide" : "Show"}
                </Button>
              </InputRightElement>
            </InputGroup>
            <FormErrorMessage gridColumn="right/error">
              {touched.password && errors.password ? (
                <Text>{errors.password}</Text>
              ) : null}
            </FormErrorMessage>

            {/* button */}
            <Button
              alignSelf="flex-end"
              mt={4}
              colorScheme="teal"
              type="submit"
              gridColumn="middle/right"
            >
              Login
            </Button>
          </Grid>
        </FormControl>
      </form>
    </Flex>
  );
};

export default React.memo(LoginPage);
