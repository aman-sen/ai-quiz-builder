'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { LayoutDashboard, BookOpen, Plus, History, LogOut, Zap } from 'lucide-react';
import clsx from 'clsx';

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/dashboard/quiz/new', label: 'Create Quiz', icon: Plus },
  { href: '/dashboard/quizzes', label: 'My Quizzes', icon: BookOpen },
  { href: '/dashboard/history', label: 'Past Results', icon: History },
];

export default function DashboardNav({ user }: { user: { name?: string | null; email?: string | null } }) {
  const path = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col fixed inset-y-0 left-0 w-60 bg-surface-1 border-r border-white/[0.06] z-40">
        <div className="px-5 h-16 flex items-center border-b border-white/[0.06]">
          <Link href="/dashboard" className="font-display font-bold text-xl text-gradient flex items-center gap-2">
            <Zap size={20} className="text-brand-400" /> QuizLive
          </Link>
        </div>
        <nav className="flex-1 px-3 py-4 space-y-1">
          {NAV.map(({ href, label, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} className={clsx('flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors', active ? 'bg-brand-600/20 text-brand-300' : 'text-white/50 hover:text-white hover:bg-white/[0.04]')}>
                <Icon size={18} />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="px-4 py-4 border-t border-white/[0.06]">
          <div className="flex items-center gap-3 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-brand-600/40 flex items-center justify-center text-brand-300 font-semibold text-sm">
              {user.name?.[0]?.toUpperCase() || 'U'}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{user.name}</p>
              <p className="text-xs text-white/30 truncate">{user.email}</p>
            </div>
          </div>
          <button onClick={() => signOut({ callbackUrl: '/login' })} className="flex items-center gap-2 text-white/30 hover:text-white/60 text-sm px-1 transition-colors">
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 inset-x-0 z-40 h-14 bg-surface-1 border-b border-white/[0.06] flex items-center justify-between px-4">
        <Link href="/dashboard" className="font-display font-bold text-xl text-gradient">QuizLive</Link>
        <div className="flex items-center gap-1">
          {NAV.map(({ href, icon: Icon, exact }) => {
            const active = exact ? path === href : path.startsWith(href);
            return (
              <Link key={href} href={href} className={clsx('p-2.5 rounded-xl transition-colors', active ? 'text-brand-400' : 'text-white/40 hover:text-white')}>
                <Icon size={20} />
              </Link>
            );
          })}
        </div>
      </div>
      <div className="lg:hidden h-14" /> {/* Spacer */}
    </>
  );
}
