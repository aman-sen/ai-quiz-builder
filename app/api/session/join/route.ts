import { NextRequest, NextResponse } from 'next/server';
import { queryOne, execute } from '@/lib/db';
import { generateId } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { joinCode, nickname } = body;

    if (!joinCode || typeof joinCode !== 'string')
      return NextResponse.json({ success: false, error: 'Join code is required' }, { status: 400 });
    if (!nickname || typeof nickname !== 'string' || !nickname.trim())
      return NextResponse.json({ success: false, error: 'Nickname is required' }, { status: 400 });

    const clean = nickname.trim().slice(0, 30);
    const code = joinCode.trim().toUpperCase();

    const session = await queryOne<{ id: string; quiz_id: string; status: string; current_question: number }>(
      "SELECT * FROM quiz_sessions WHERE join_code = ? AND status != 'ended'", [code]
    );
    if (!session)
      return NextResponse.json({ success: false, error: 'Quiz not found. Check your code and try again.' }, { status: 404 });

    if (session.status === 'active' || session.status === 'paused') {
      const quiz = await queryOne<{ settings: string }>('SELECT settings FROM quizzes WHERE id = ?', [session.quiz_id]);
      const settings = quiz ? JSON.parse(quiz.settings) : {};
      if (!settings.allowLateJoin)
        return NextResponse.json({ success: false, error: 'This quiz has already started.' }, { status: 409 });
    }

    // Case-insensitive nickname check
    const existing = await queryOne(
      'SELECT id FROM participants WHERE session_id = ? AND lower(nickname) = lower(?)',
      [session.id, clean]
    );
    if (existing)
      return NextResponse.json({ success: false, error: 'That nickname is taken. Please choose another.' }, { status: 409 });

    const participantId = generateId();
    await execute(
      'INSERT INTO participants (id, session_id, nickname, score, correct, incorrect) VALUES (?, ?, ?, 0, 0, 0)',
      [participantId, session.id, clean]
    );

    const quiz = await queryOne<{ title: string }>('SELECT title FROM quizzes WHERE id = ?', [session.quiz_id]);
    const qCount = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?', [session.quiz_id]);

    return NextResponse.json({
      success: true,
      data: {
        participantId, sessionId: session.id, nickname: clean,
        sessionStatus: session.status,
        quizTitle: quiz?.title,
        questionCount: Number(qCount?.c ?? 0),
      },
    }, { status: 201 });
  } catch (err) {
    console.error('[session/join]', err);
    return NextResponse.json({ success: false, error: 'Failed to join session' }, { status: 500 });
  }
}
