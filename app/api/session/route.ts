import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne, execute } from '@/lib/db';
import { generateId, generateJoinCode } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const { quizId } = await req.json();
    if (!quizId) return NextResponse.json({ success: false, error: 'quizId required' }, { status: 400 });

    const userId = (session.user as { id: string }).id;
    const quiz = await queryOne('SELECT id FROM quizzes WHERE id = ? AND creator_id = ?', [quizId, userId]);
    if (!quiz) return NextResponse.json({ success: false, error: 'Quiz not found' }, { status: 404 });

    const qCount = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?', [quizId]);
    if (!qCount || Number(qCount.c) === 0)
      return NextResponse.json({ success: false, error: 'Quiz has no questions' }, { status: 400 });

    // Generate unique join code
    let joinCode = generateJoinCode();
    for (let i = 0; i < 10; i++) {
      const existing = await queryOne("SELECT id FROM quiz_sessions WHERE join_code = ? AND status != 'ended'", [joinCode]);
      if (!existing) break;
      joinCode = generateJoinCode();
    }

    const sessionId = generateId();
    await execute(
      'INSERT INTO quiz_sessions (id, quiz_id, host_id, join_code, status, current_question) VALUES (?, ?, ?, ?, ?, ?)',
      [sessionId, quizId, userId, joinCode, 'waiting', -1]
    );

    return NextResponse.json({ success: true, data: { id: sessionId, joinCode } }, { status: 201 });
  } catch (err) {
    console.error('[session/POST]', err);
    return NextResponse.json({ success: false, error: 'Failed to create session' }, { status: 500 });
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const sessions = await query(
    `SELECT qs.*, q.title as quiz_title, COUNT(p.id) as participant_count
     FROM quiz_sessions qs
     JOIN quizzes q ON q.id = qs.quiz_id
     LEFT JOIN participants p ON p.session_id = qs.id
     WHERE qs.host_id = ?
     GROUP BY qs.id ORDER BY qs.created_at DESC`,
    [userId]
  );
  return NextResponse.json({ success: true, data: sessions });
}
