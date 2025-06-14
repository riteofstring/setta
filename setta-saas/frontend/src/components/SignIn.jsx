import { SignIn } from "@clerk/clerk-react";

export default function SignInPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-white dark:bg-setta-850 shadow-lg",
          },
        }}
        routing="hash"
        signUpUrl="/sign-up"
        fallbackRedirectUrl="/projects"
      />
    </div>
  );
}
