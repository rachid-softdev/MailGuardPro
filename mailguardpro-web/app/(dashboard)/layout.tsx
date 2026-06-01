import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/Sidebar";
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

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex">
      {/* Sidebar */}
      <aside className="w-[var(--sidebar-width)] border-r border-[var(--border)] bg-[var(--bg-surface)] fixed h-full">
        <Sidebar credits={credits} />
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[var(--sidebar-width)]">{children}</main>
    </div>
  );
}
