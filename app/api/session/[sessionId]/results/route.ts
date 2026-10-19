import { NextRequest, NextResponse } from 'next/server';
import { query, queryOne } from '@/lib/db';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await queryOne<{ id: string; quiz_id: string; status: string; ended_at: string | null }>(
    'SELECT * FROM quiz_sessions WHERE id = ?', [sessionId]
  );
  if (!session) return NextResponse.json({ success: false, error: 'Session not found' }, { status: 404 });
  if (session.status !== 'ended') return NextResponse.json({ success: false, error: 'Quiz not yet ended' }, { status: 400 });

  const participants = await query('SELECT * FROM participants WHERE session_id = ? ORDER BY score DESC', [sessionId]);
  const prizes = await query('SELECT * FROM prizes WHERE quiz_id = ? ORDER BY rank', [session.quiz_id]);
  const quiz = await queryOne<{ title: string }>('SELECT title FROM quizzes WHERE id = ?', [session.quiz_id]);

  return NextResponse.json({ success: true, data: { session, participants, prizes, quizTitle: quiz?.title } });
}
