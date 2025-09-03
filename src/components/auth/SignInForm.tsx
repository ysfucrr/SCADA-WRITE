"use client";
import Input from "@/components/form/input/InputField";
import Label from "@/components/form/Label";
import Button from "@/components/ui/button/Button";
import { EyeCloseIcon, EyeIcon } from "@/icons";
import Link from "next/link";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { GhostButton } from "../ui/button/CustomButton";
import { showInfoAlert } from "../ui/alert";

export default function SignInForm() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  return (
    <div className="flex flex-col flex-1 lg:w-1/2 w-full z-100 ">
      <div className="w-full max-w-md sm:pt-10 mx-auto mb-5">
        {/* <Link
          href="/"
          className="inline-flex items-center text-sm text-gray-500 transition-colors hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          <ChevronLeftIcon />
          Back to dashboard
        </Link> */}
      </div>
      <div className="flex flex-col justify-center flex-1 w-full max-w-md mx-auto ">
        <div className="bg-white dark:bg-gray-900 p-8 rounded-lg shadow-lg">
          <div className="mb-5 sm:mb-8">
            <h1 className="mb-2 font-semibold text-gray-800 text-title-sm dark:text-white/90 sm:text-title-md">
              Sign In
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your username and password to sign in!
            </p>
          </div>
          <div>

            <div className="relative py-3 sm:py-5">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-200 dark:border-gray-800"></div>
              </div>

            </div>
            <form onSubmit={async (e) => {
                e.preventDefault();
                if (!username || !password) {
                  setError("Username and password are required");
                  return;
                }
                
                try {
                  setIsLoading(true);
                  setError("");
                  
                  const result = await signIn("credentials", {
                    username,
                    password,
                    redirect: false,
                  });
                  
                  if (result?.error) {
                    setError("Invalid username or password");
                    setIsLoading(false);
                  } else {
                    // URL'den callbackUrl parametresini al
                    const searchParams = new URLSearchParams(window.location.search);
                    const callbackUrl = searchParams.get('callbackUrl');
                    
                    // Eğer callbackUrl varsa oraya, yoksa ana sayfaya yönlendir
                    router.push(callbackUrl || "/");
                  }
                } catch (err) {
                  console.error("Login error:", err);
                  setError("An error occurred during login");
                  setIsLoading(false);
                }
              }}>
              <div className="space-y-6">
                {error && (
                  <div className="p-3 text-sm text-white bg-error-500 rounded-md">
                    {error}
                  </div>
                )}
                <div>
                  <Label>
                    Username <span className="text-error-500">*</span>{" "}
                  </Label>
                  <Input 
                    placeholder="Enter your username" 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div>
                  <Label>
                    Password <span className="text-error-500">*</span>{" "}
                  </Label>
                  <div className="relative">
                    <Input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                    <span
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute z-30 -translate-y-1/2 cursor-pointer right-4 top-1/2"
                    >
                      {showPassword ? (
                        <EyeIcon className="fill-gray-500 dark:fill-gray-400" />
                      ) : (
                        <EyeCloseIcon className="fill-gray-500 dark:fill-gray-400" />
                      )}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">                    
                  </div>
                  <GhostButton
                    type="button"
                    onClick={() => {
                      showInfoAlert("Forgot password?", "Contact system administrator to reset your password.")
                    }}
                    className="text-sm text-brand-500 hover:text-brand-600 dark:text-brand-400"
                  >
                    Forgot password?
                  </GhostButton>
                </div>
                <div>
                  <Button 
                    className="w-full" 
                    type="submit" 
                    size="sm"
                    disabled={isLoading}
                  >
                    {isLoading ? "Signing in..." : "Sign in"}
                  </Button>
                </div>
              </div>
            </form>

         
          </div>
        </div>
      </div>
    </div>
  );
}
