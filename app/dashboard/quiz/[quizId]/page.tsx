import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import QuizEditor from '@/components/QuizEditor';

export default async function EditQuizPage({ params }: { params: Promise<{ quizId: string }> }) {
  const { quizId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  const user = session.user as { id: string };

  const quiz = await queryOne<{ id: string; title: string; description: string | null; settings: string; status: string }>(
    'SELECT * FROM quizzes WHERE id = ? AND creator_id = ?', [quizId, user.id]
  );
  if (!quiz) redirect('/dashboard/quizzes');

  const questions = await query<{ id: string; order_index: number; type: string; text: string; options: string; correct_answer: number; explanation: string | null; difficulty: string; points: number; time_limit: number }>(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index', [quizId]
  );
  const prizes = await query<{ id: string; rank: number; label: string; description: string | null }>(
    'SELECT * FROM prizes WHERE quiz_id = ? ORDER BY rank', [quizId]
  );

  const data = {
    ...quiz,
    settings: JSON.parse(quiz.settings),
    questions: questions.map(q => ({
      id: q.id, text: q.text, type: q.type, options: JSON.parse(q.options),
      correctAnswer: Number(q.correct_answer), explanation: q.explanation ?? '',
      difficulty: q.difficulty, points: Number(q.points), timeLimit: Number(q.time_limit),
    })),
    prizes: prizes.map(p => ({ rank: Number(p.rank), label: p.label, description: p.description })),
  };

  return <QuizEditor initialData={data} />;
}
