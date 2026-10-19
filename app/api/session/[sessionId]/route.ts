import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const quizSession = await queryOne<{ id: string; quiz_id: string; quiz_title: string; settings: string; status: string; join_code: string; current_question: number }>(
    `SELECT qs.*, q.title as quiz_title, q.settings
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id
     WHERE qs.id = ? AND qs.host_id = ?`,
    [sessionId, userId]
  );
  if (!quizSession) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });

  const participants = await query('SELECT * FROM participants WHERE session_id = ? ORDER BY score DESC', [sessionId]);
  const questions = await query<{ id: string; order_index: number; type: string; text: string; options: string; correct_answer: number; explanation: string | null; difficulty: string; points: number; time_limit: number }>(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index', [quizSession.quiz_id]
  );
  const prizes = await query('SELECT * FROM prizes WHERE quiz_id = ? ORDER BY rank', [quizSession.quiz_id]);

  return NextResponse.json({
    success: true,
    data: {
      ...quizSession,
      settings: JSON.parse(quizSession.settings),
      participants,
      questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })),
      prizes,
    },
  });
}
