import React from "react";
import { useForm } from "react-hook-form";
import {
  FormErrorMessage,
  FormLabel,
  FormControl,
  Flex,
  Text,
  Box,
  Button,
  InputGroup,
  InputLeftAddon,
  Input,
  Spacer,
  Grid,
} from "@chakra-ui/react";

const SignUpPage = () => {
  const { handleSubmit, errors, register, formState } = useForm();

  function validateName(value) {
    if (!value) {
      return "Username is required";
    } else if (value !== "Naruto") {
      return "Jeez! You're not a fan 😱";
    } else return true;
  }

  function onSubmit(values) {
    return new Promise((resolve) => {
      setTimeout(() => {
        alert(JSON.stringify(values, null, 2));
        resolve();
      }, 3000);
    });
  }
  return (
    <Flex
      flexDirection="column"
      width="300px"
      minHeight="200px"
      mt="200px"
      justifyContent="center"
      alignItems="center"
    >
      {/* <Box>
        <Text fontSize="4xl">Login</Text>
      </Box>
      <Spacer />
      <InputGroup>
        <InputLeftAddon>Username</InputLeftAddon>
        <Input />
      </InputGroup>
      <Spacer />
      <InputGroup>
        <InputLeftAddon>Password</InputLeftAddon>
        <Input />
      </InputGroup>
      <Grid
        templateColumns="0.5fr 1fr"
        gap={6}
        width="500px"
        minHeight="200px"
        templateRows="0.5fr 0.5fr"
      >
        <Text>Text value</Text>
        <Input />
        <Text>Text value</Text>
        <Input />
      </Grid>
      <Spacer />
      <Button variant="solid" size="md">
        Button text
      </Button> */}

      <form onSubmit={handleSubmit(onSubmit)}>
        <FormControl isInvalid={errors.username}>
          <FormLabel htmlFor="username">Username</FormLabel>
          <Input
            name="username"
            placeholder="username"
            ref={register({ validate: validateName })}
          />
          <FormErrorMessage>
            {errors.username && errors.username.message}
          </FormErrorMessage>
          <FormLabel htmlFor="password">Password</FormLabel>
          <Input
            name="password"
            placeholder="password"
            ref={register({ validate: validateName })}
          />
          <FormErrorMessage>
            {errors.password && errors.password.message}
          </FormErrorMessage>
        </FormControl>
        <Button
          mt={4}
          colorScheme="teal"
          isLoading={formState.isSubmitting}
          type="submit"
        >
          Submit
        </Button>
      </form>
    </Flex>
  );
};

export default React.memo(SignUpPage);
