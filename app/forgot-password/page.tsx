import { ForgotPasswordForm } from "@/components/auth/ForgotPasswordForm";

export const metadata = {
  title: "Reset your password",
  description: "Request a password reset link for your PRSME account.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}