// Two-factor challenge page — reached after a primary sign-in when the account
// has TOTP enabled and this device has not passed the challenge yet.
//
// The wrapper is a server component so a browser with no pending challenge
// (logged out, already verified, expired session) is sent straight to /login.

import { redirect } from "next/navigation";
import { hasPendingTwoFactorChallenge } from "@/lib/pendingTwoFactor";
import { TwoFactorChallengeForm } from "./TwoFactorChallengeForm";

export default async function TwoFactorChallengePage() {
  if (!(await hasPendingTwoFactorChallenge())) {
    redirect("/login");
  }
  return <TwoFactorChallengeForm />;
}
