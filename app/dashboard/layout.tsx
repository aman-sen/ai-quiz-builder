import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import DashboardNav from '@/components/DashboardNav';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  return (
    <div className="min-h-screen flex">
      <DashboardNav user={session.user as { name?: string | null; email?: string | null }} />
      <main className="flex-1 ml-0 lg:ml-60 min-h-screen">
        {children}
      </main>
    </div>
  );
}
