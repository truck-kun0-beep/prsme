import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { getCurrentUserId } from "@/lib/supabase/session";
import { getProfileForUser } from "@/lib/supabase/profiles";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { SignInForm } from "@/components/auth/SignInForm";

/**
 * /onboarding
 *
 * The gate between "authenticated" and "has a profile".
 *
 *   - not configured        -> the sign-in shell's setup message (no crash)
 *   - not authenticated    -> sign in, then return here
 *   - already has a profile-> straight to the Studio (never a second create)
 *   - otherwise            -> the creation form
 *
 * This is a Server Component so the routing decision is made before any of the
 * form's client code loads — an account that already owns a profile never sees
 * a "create your profile" affordance at all.
 */
export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return <SignInForm />;
  }

  const userId = await getCurrentUserId();
  if (!userId) {
    redirect("/sign-in?next=/onboarding");
  }

  const profile = await getProfileForUser();
  if (profile) {
    redirect("/studio");
  }

  return <OnboardingForm />;
}

export const metadata = {
  title: "Create your profile",
  description: "Set up your PRSME profile.",
};