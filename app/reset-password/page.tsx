import { ResetPasswordForm } from "@/components/auth/ResetPasswordForm";

export const metadata = {
  title: "Choose a new password",
  description: "Set a new password for your PRSME account.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}