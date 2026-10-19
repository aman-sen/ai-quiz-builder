import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';
import Link from 'next/link';
import { History, Users, Trophy } from 'lucide-react';

export default async function HistoryPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as { id: string };

  const sessions = await query<{ id: string; quiz_title: string; join_code: string; participant_count: number; top_score: number; question_count: number; created_at: string; ended_at: string }>(
    `SELECT qs.id, q.title as quiz_title, qs.join_code, qs.created_at, qs.ended_at,
            COUNT(DISTINCT p.id) as participant_count,
            MAX(p.score) as top_score,
            COUNT(DISTINCT qu.id) as question_count
     FROM quiz_sessions qs
     JOIN quizzes q ON q.id = qs.quiz_id
     LEFT JOIN participants p ON p.session_id = qs.id
     LEFT JOIN questions qu ON qu.quiz_id = q.id
     WHERE qs.host_id = ? AND qs.status = 'ended'
     GROUP BY qs.id ORDER BY qs.ended_at DESC`,
    [user.id]
  );

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl">Past Results</h1>
        <p className="text-white/40 mt-1">{sessions.length} completed session{sessions.length !== 1 ? 's' : ''}</p>
      </div>

      {sessions.length === 0 ? (
        <div className="card p-12 text-center">
          <History size={40} className="text-white/20 mx-auto mb-4" />
          <p className="text-white/40">No completed sessions yet. Run a quiz to see results here.</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {sessions.map((s, i) => (
            <div key={s.id} className={`flex items-center gap-5 px-5 py-4 hover:bg-white/[0.02] ${i < sessions.length - 1 ? 'border-b border-white/[0.05]' : ''}`}>
              <div className="flex-1 min-w-0">
                <div className="font-medium mb-0.5">{s.quiz_title}</div>
                <div className="text-white/30 text-xs flex items-center gap-3">
                  <span className="font-mono">{s.join_code}</span>
                  <span>{Number(s.question_count)} questions</span>
                  <span>{new Date(s.ended_at || s.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="flex items-center gap-6 text-sm shrink-0">
                <div className="text-center hidden sm:block">
                  <div className="flex items-center gap-1.5 text-white/60"><Users size={14} />{Number(s.participant_count)}</div>
                  <div className="text-white/25 text-xs">students</div>
                </div>
                <div className="text-center hidden sm:block">
                  <div className="flex items-center gap-1.5 text-yellow-400"><Trophy size={14} />{Number(s.top_score ?? 0)}</div>
                  <div className="text-white/25 text-xs">top score</div>
                </div>
                <Link href={`/host/${s.id}`} className="btn-secondary py-1.5 px-3 text-xs">View results</Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
