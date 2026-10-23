import { redirect } from "next/navigation";
import { SignInForm } from "@/components/auth/SignInForm";

/**
 * /sign-in
 *
 * A thin server wrapper so the page itself is a Server Component while the
 * form stays client-side. Signed-in visitors are sent on rather than shown a
 * login form they do not need.
 */
export default function SignInPage() {
  return <SignInForm />;
}

export const metadata = {
  title: "Sign in",
  description: "Sign in to your PRSME account and pick up your profile.",
};