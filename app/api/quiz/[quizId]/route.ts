import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { query, queryOne, execute, batch } from '@/lib/db';
import { generateId } from '@/lib/auth';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const quiz = await queryOne<{ id: string; title: string; description: string | null; settings: string; status: string; created_at: string }>(
    'SELECT * FROM quizzes WHERE id = ? AND creator_id = ?', [quizId, userId]
  );
  if (!quiz) return NextResponse.json({ success: false, error: 'Quiz not found' }, { status: 404 });

  const questions = await query<{ id: string; order_index: number; type: string; text: string; options: string; correct_answer: number; explanation: string | null; difficulty: string; points: number; time_limit: number }>(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index', [quizId]
  );
  const prizes = await query('SELECT * FROM prizes WHERE quiz_id = ? ORDER BY rank', [quizId]);

  return NextResponse.json({
    success: true,
    data: {
      ...quiz,
      settings: JSON.parse(quiz.settings),
      questions: questions.map(q => ({ ...q, options: JSON.parse(q.options) })),
      prizes,
    },
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const quiz = await queryOne('SELECT id FROM quizzes WHERE id = ? AND creator_id = ?', [quizId, userId]);
  if (!quiz) return NextResponse.json({ success: false, error: 'Quiz not found' }, { status: 404 });

  try {
    const body = await req.json();
    const { title, description, settings, questions, prizes } = body;

    const stmts: Array<{ sql: string; args: (string | number | null)[] }> = [];

    if (title) {
      stmts.push({
        sql: "UPDATE quizzes SET title = ?, description = ?, settings = ?, updated_at = datetime('now') WHERE id = ?",
        args: [title.trim(), description?.trim() ?? null, JSON.stringify(settings), quizId],
      });
    }

    if (Array.isArray(questions)) {
      stmts.push({ sql: 'DELETE FROM questions WHERE quiz_id = ?', args: [quizId] });
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        stmts.push({
          sql: `INSERT INTO questions (id, quiz_id, order_index, type, text, options, correct_answer, explanation, difficulty, points, time_limit)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [q.id ?? generateId(), quizId, i, q.type ?? 'mcq', q.text.trim(),
                 JSON.stringify(q.options.map((o: unknown) => String(o).trim())),
                 q.correctAnswer, q.explanation?.trim() ?? null,
                 q.difficulty ?? 'medium', q.points ?? 100, q.timeLimit ?? 30],
        });
      }
    }

    if (Array.isArray(prizes)) {
      stmts.push({ sql: 'DELETE FROM prizes WHERE quiz_id = ?', args: [quizId] });
      for (const prize of prizes) {
        if (prize.label?.trim()) {
          stmts.push({
            sql: 'INSERT INTO prizes (id, quiz_id, rank, label, description) VALUES (?, ?, ?, ?, ?)',
            args: [generateId(), quizId, prize.rank, prize.label.trim(), prize.description?.trim() ?? null],
          });
        }
      }
    }

    if (stmts.length > 0) await batch(stmts);
    return NextResponse.json({ success: true, data: { id: quizId } });
  } catch (err) {
    console.error('[quiz/PUT]', err);
    return NextResponse.json({ success: false, error: 'Failed to update quiz' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  const userId = (session.user as { id: string }).id;

  const rows = await execute('DELETE FROM quizzes WHERE id = ? AND creator_id = ?', [quizId, userId]);
  if (rows === 0) return NextResponse.json({ success: false, error: 'Quiz not found' }, { status: 404 });
  return NextResponse.json({ success: true, data: null });
}
