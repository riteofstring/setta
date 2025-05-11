import { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    // In a real app, you would authenticate with your backend here
    // For now, we'll just simulate a successful login
    localStorage.setItem("isAuthenticated", "true");
    navigate("/projects");
  };

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg dark:bg-setta-850 border border-solid border-setta-200 dark:border-setta-700">
        <h2 className="mt-6 text-center text-3xl font-heading text-setta-800 dark:text-setta-100">
          Sign in to your account
        </h2>
        <form className="flex flex-col gap-2" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="email-address" className="sr-only">
              Email address
            </label>
            <input
              id="email-address"
              name="email"
              type="email"
              required
              className="relative block w-full rounded-full px-3 py-2 text-setta-800 ring-0 border border-solid border-setta-200/50 placeholder:text-setta-400 focus-visible:ring-0 outline-blue-600 focus-visible:outline dark:bg-setta-875 dark:text-setta-100 dark:border-setta-700"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="sr-only">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              className="relative block w-full rounded-full px-3 py-2 text-setta-800 ring-0 border border-solid border-setta-200/50 placeholder:text-setta-400 focus-visible:ring-0 outline-blue-600 focus-visible:outline dark:bg-setta-875 dark:text-setta-100 dark:border-setta-700"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="group relative flex w-full justify-center rounded-full bg-setta-600 py-2 px-3 font-semibold text-white hover:bg-setta-500 focus:outline-none focus:ring-2 focus:ring-setta-500 focus:ring-offset-2 dark:bg-setta-700 dark:hover:bg-setta-600"
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
