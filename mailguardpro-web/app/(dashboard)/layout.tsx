import { redirect } from "next/navigation";
import { DashboardShell } from "@/components/layout/DashboardShell";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  // Get user credits from database
  const { prisma } = await import("@/lib/prisma");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { credits: true },
  });
  const credits = user?.credits ?? 0;

  return <DashboardShell credits={credits}>{children}</DashboardShell>;
}
