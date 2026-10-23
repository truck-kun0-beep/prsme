import { SignUpForm } from "@/components/auth/SignUpForm";

export const metadata = {
  title: "Create your account",
  description:
    "Create a PRSME account. One account, one profile, on every device.",
};

export default function SignUpPage() {
  return <SignUpForm />;
}