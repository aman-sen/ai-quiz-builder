import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne, execute, batch } from '@/lib/db';
import { generateId } from '@/lib/auth';

const DEFAULT_SETTINGS = {
  timePerQuestion: 30, shuffleQuestions: false, shuffleOptions: false,
  negativeMarking: false, negativePoints: 25, showExplanation: true, allowLateJoin: false,
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const quizzes = await query<{ id: string; title: string; description: string | null; status: string; created_at: string; settings: string; session_count: number }>(
    `SELECT q.*, COUNT(qs.id) as session_count
     FROM quizzes q LEFT JOIN quiz_sessions qs ON qs.quiz_id = q.id
     WHERE q.creator_id = ? GROUP BY q.id ORDER BY q.created_at DESC`,
    [userId]
  );

  return NextResponse.json({
    success: true,
    data: quizzes.map(q => ({ ...q, settings: JSON.parse(q.settings), sessionCount: q.session_count })),
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { title, description, settings, questions, prizes } = body;

    if (!title?.trim()) return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    if (!Array.isArray(questions) || questions.length === 0)
      return NextResponse.json({ success: false, error: 'At least one question required' }, { status: 400 });

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.text?.trim()) return NextResponse.json({ success: false, error: `Question ${i + 1}: text required` }, { status: 400 });
      if (!Array.isArray(q.options) || q.options.length < 2) return NextResponse.json({ success: false, error: `Question ${i + 1}: need ≥2 options` }, { status: 400 });
      if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer >= q.options.length)
        return NextResponse.json({ success: false, error: `Question ${i + 1}: invalid correct answer` }, { status: 400 });
    }

    const userId = (session.user as { id: string }).id;
    const quizId = generateId();
    const merged = { ...DEFAULT_SETTINGS, ...settings };

    const stmts: Array<{ sql: string; args: (string | number | null)[] }> = [
      {
        sql: 'INSERT INTO quizzes (id, title, description, creator_id, settings, status) VALUES (?, ?, ?, ?, ?, ?)',
        args: [quizId, title.trim(), description?.trim() ?? null, userId, JSON.stringify(merged), 'draft'],
      },
    ];

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      stmts.push({
        sql: `INSERT INTO questions (id, quiz_id, order_index, type, text, options, correct_answer, explanation, difficulty, points, time_limit)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [generateId(), quizId, i, q.type ?? 'mcq', q.text.trim(),
               JSON.stringify(q.options.map((o: string) => String(o).trim())),
               q.correctAnswer, q.explanation?.trim() ?? null,
               q.difficulty ?? 'medium', q.points ?? 100, q.timeLimit ?? merged.timePerQuestion],
      });
    }

    if (Array.isArray(prizes)) {
      for (const prize of prizes) {
        if (prize.label?.trim()) {
          stmts.push({
            sql: 'INSERT INTO prizes (id, quiz_id, rank, label, description) VALUES (?, ?, ?, ?, ?)',
            args: [generateId(), quizId, prize.rank, prize.label.trim(), prize.description?.trim() ?? null],
          });
        }
      }
    }

    await batch(stmts);
    return NextResponse.json({ success: true, data: { id: quizId } }, { status: 201 });
  } catch (err) {
    console.error('[quiz/POST]', err);
    return NextResponse.json({ success: false, error: 'Failed to create quiz' }, { status: 500 });
  }
}
