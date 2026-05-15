import { auth, signOut } from '@/lib/auth'
import Link from 'next/link'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  
  if (!session?.user) {
    redirect('/login')
  }

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: '◉' },
    { href: '/validate', label: 'Validate', icon: '✓' },
    { href: '/bulk', label: 'Bulk', icon: '↑' },
    { href: '/api-keys', label: 'API Keys', icon: '⚿' },
    { href: '/webhooks', label: 'Webhooks', icon: '⚡' },
    { href: '/settings', label: 'Settings', icon: '⚙' },
  ]

  return (
    <div className="min-h-screen bg-[var(--bg-base)] flex">
      {/* Sidebar */}
      <aside className="w-[var(--sidebar-width)] border-r border-[var(--border)] bg-[var(--bg-surface)] fixed h-full">
        <div className="p-4 border-b border-[var(--border)]">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[var(--accent)] rounded-lg" />
            <span className="font-display font-bold">MailGuard</span>
          </Link>
        </div>
        
        <nav className="p-4">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2 rounded-md text-sm hover:bg-[var(--bg-subtle)] mb-1"
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 w-full p-4 border-t border-[var(--border)]">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-[var(--text-muted)]">Credits</p>
              <p className="font-mono font-semibold">{session.user.credits}</p>
            </div>
            <form action={async () => {
              'use server'
              await signOut({ redirectTo: '/' })
            }}>
              <button className="btn btn-ghost btn-sm">Sign out</button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-[var(--sidebar-width)]">
        {children}
      </main>
    </div>
  )
}