import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import Link from 'next/link';
import { Plus, BookOpen, Play, History, ChevronRight, Users } from 'lucide-react';
import QuizCardActions from '@/components/QuizCardActions';

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as { id: string; name?: string | null };

  const quizCount = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM quizzes WHERE creator_id = ?', [user.id]);
  const sessionCount = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM quiz_sessions WHERE host_id = ?', [user.id]);
  const totalParticipants = await queryOne<{ c: number }>(
    'SELECT COUNT(*) as c FROM participants p JOIN quiz_sessions s ON s.id = p.session_id WHERE s.host_id = ?', [user.id]
  );

  const recentSessions = await query<{ id: string; quiz_title: string; status: string; join_code: string; participant_count: number; created_at: string }>(
    `SELECT qs.id, q.title as quiz_title, qs.status, qs.join_code, qs.created_at, COUNT(p.id) as participant_count
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id
     LEFT JOIN participants p ON p.session_id = qs.id
     WHERE qs.host_id = ? GROUP BY qs.id ORDER BY qs.created_at DESC LIMIT 5`,
    [user.id]
  );

  const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl">{greeting()}, {user.name?.split(' ')[0]} 👋</h1>
        <p className="text-white/40 mt-1">Ready to run a quiz today?</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Quizzes', value: Number(quizCount?.c ?? 0), icon: BookOpen },
          { label: 'Sessions run', value: Number(sessionCount?.c ?? 0), icon: Play },
          { label: 'Students reached', value: Number(totalParticipants?.c ?? 0), icon: Users },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="card p-5">
            <Icon size={18} className="text-brand-400 mb-3" />
            <div className="font-display font-bold text-3xl">{value}</div>
            <div className="text-white/40 text-sm mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        <Link href="/dashboard/quiz/new" className="card p-6 hover:border-brand-600/40 transition-colors group flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-brand flex items-center justify-center shrink-0">
            <Plus size={24} className="text-white" />
          </div>
          <div>
            <div className="font-semibold">Create new quiz</div>
            <div className="text-white/40 text-sm">AI-powered, takes 30 seconds</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-white/20 group-hover:text-brand-400 transition-colors" />
        </Link>
        <Link href="/dashboard/quizzes" className="card p-6 hover:border-white/15 transition-colors group flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-surface-3 flex items-center justify-center shrink-0">
            <BookOpen size={22} className="text-white/60" />
          </div>
          <div>
            <div className="font-semibold">My quizzes</div>
            <div className="text-white/40 text-sm">{Number(quizCount?.c ?? 0)} quizzes ready to launch</div>
          </div>
          <ChevronRight size={18} className="ml-auto text-white/20 group-hover:text-white/60 transition-colors" />
        </Link>
      </div>

      {recentSessions.length > 0 && (
        <div className="mb-8">
          <h2 className="font-semibold mb-4 flex items-center gap-2"><History size={18} className="text-white/40" /> Recent sessions</h2>
          <div className="card overflow-hidden">
            {recentSessions.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-4 px-5 py-4 ${i < recentSessions.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{s.quiz_title}</div>
                  <div className="text-white/40 text-sm">{Number(s.participant_count)} students · {new Date(s.created_at).toLocaleDateString()}</div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`badge ${s.status === 'ended' ? 'bg-white/[0.06] text-white/40' : s.status === 'active' ? 'bg-green-900/40 text-green-400' : 'bg-brand-900/40 text-brand-300'}`}>{s.status}</span>
                  <span className="font-mono text-sm text-white/30">{s.join_code}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {Number(quizCount?.c ?? 0) === 0 && (
        <div className="card p-12 text-center">
          <div className="text-5xl mb-4">🧠</div>
          <h2 className="font-display font-bold text-xl mb-2">No quizzes yet</h2>
          <p className="text-white/40 mb-6">Create your first AI-powered quiz in under a minute.</p>
          <Link href="/dashboard/quiz/new" className="btn-primary inline-flex items-center gap-2"><Plus size={18} /> Create first quiz</Link>
        </div>
      )}
    </div>
  );
}
