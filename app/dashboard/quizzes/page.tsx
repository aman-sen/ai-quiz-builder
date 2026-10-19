import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query } from '@/lib/db';
import Link from 'next/link';
import { Plus, BookOpen } from 'lucide-react';
import QuizCardActions from '@/components/QuizCardActions';

export default async function QuizzesPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as { id: string };

  const quizzes = await query<{ id: string; title: string; description: string | null; status: string; session_count: number; question_count: number; created_at: string }>(
    `SELECT q.id, q.title, q.description, q.status, q.created_at,
            COUNT(DISTINCT qs.id) as session_count,
            COUNT(DISTINCT qu.id) as question_count
     FROM quizzes q
     LEFT JOIN quiz_sessions qs ON qs.quiz_id = q.id
     LEFT JOIN questions qu ON qu.quiz_id = q.id
     WHERE q.creator_id = ?
     GROUP BY q.id ORDER BY q.created_at DESC`,
    [user.id]
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-3xl">My Quizzes</h1>
          <p className="text-white/40 mt-1">{quizzes.length} quiz{quizzes.length !== 1 ? 'zes' : ''}</p>
        </div>
        <Link href="/dashboard/quiz/new" className="btn-primary inline-flex items-center gap-2"><Plus size={18} /> New quiz</Link>
      </div>

      {quizzes.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen size={40} className="text-white/20 mx-auto mb-4" />
          <p className="text-white/40 mb-4">No quizzes yet. Create your first one!</p>
          <Link href="/dashboard/quiz/new" className="btn-primary inline-flex items-center gap-2"><Plus size={18} /> Create quiz</Link>
        </div>
      ) : (
        <div className="grid gap-4">
          {quizzes.map(q => (
            <div key={q.id} className="card p-5 flex items-center gap-5 hover:border-white/[0.12] transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold truncate">{q.title}</span>
                  <span className={`badge text-xs ${q.status === 'published' ? 'bg-green-900/40 text-green-400' : 'bg-white/[0.06] text-white/40'}`}>{q.status}</span>
                </div>
                {q.description && <p className="text-white/40 text-sm truncate mb-1">{q.description}</p>}
                <p className="text-white/30 text-xs">{Number(q.question_count)} questions · {Number(q.session_count)} session{Number(q.session_count) !== 1 ? 's' : ''} · {new Date(q.created_at).toLocaleDateString()}</p>
              </div>
              <QuizCardActions quizId={q.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
