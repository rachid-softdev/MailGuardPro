import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { auth } from "@/lib/auth";
import { hasPendingTwoFactorChallenge } from "@/lib/pendingTwoFactor";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    // A session pending the two-factor challenge resolves as unauthenticated —
    // send it to the challenge page instead of the generic login page.
    if (await hasPendingTwoFactorChallenge()) {
      redirect("/login/2fa");
    }
    redirect("/login");
  }

  // Get user credits from database
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true, plan: true },
  });
  const credits = user?.credits ?? 0;
  const plan = user?.plan ?? "FREE";

  return (
    <DashboardShell credits={credits} plan={plan}>
      {children}
    </DashboardShell>
  );
}
