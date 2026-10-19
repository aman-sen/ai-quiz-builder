import { getServerSession } from 'next-auth';
import { redirect } from 'next/navigation';
import { authOptions } from '@/lib/auth';
import { queryOne, query } from '@/lib/db';
import HostLiveClient from '@/components/HostLiveClient';

export default async function HostPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect('/login');
  const user = session.user as { id: string };

  const quizSession = await queryOne<{ id: string; quiz_id: string; host_id: string; quiz_title: string; join_code: string; status: string; current_question: number; settings: string }>(
    `SELECT qs.*, q.title as quiz_title, q.settings
     FROM quiz_sessions qs JOIN quizzes q ON q.id = qs.quiz_id
     WHERE qs.id = ? AND qs.host_id = ?`,
    [sessionId, user.id]
  );
  if (!quizSession) redirect('/dashboard');

  const questions = await query<{ id: string; order_index: number; type: string; text: string; options: string; correct_answer: number; explanation: string | null; difficulty: string; points: number; time_limit: number }>(
    'SELECT * FROM questions WHERE quiz_id = ? ORDER BY order_index', [quizSession.quiz_id]
  );
  const participants = await query<{ id: string; nickname: string; score: number; rank: number; correct: number; incorrect: number; joined_at: string }>(
    'SELECT * FROM participants WHERE session_id = ? ORDER BY score DESC', [sessionId]
  );
  const prizes = await query<{ rank: number; label: string }>(
    `SELECT p.rank, p.label FROM prizes p
     JOIN quizzes q ON q.id = p.quiz_id
     JOIN quiz_sessions qs ON qs.quiz_id = q.id
     WHERE qs.id = ? ORDER BY p.rank`,
    [sessionId]
  );

  return (
    <HostLiveClient
      sessionId={sessionId}
      hostId={user.id}
      quizTitle={quizSession.quiz_title}
      joinCode={quizSession.join_code}
      initialStatus={quizSession.status}
      initialQuestion={Number(quizSession.current_question)}
      questions={questions.map(q => ({
        ...q,
        options: JSON.parse(q.options),
        correctAnswer: Number(q.correct_answer),
        timeLimit: Number(q.time_limit),
        order_index: Number(q.order_index),
        points: Number(q.points),
      }))}
      initialParticipants={participants.map(p => ({
        ...p,
        score: Number(p.score),
        rank: Number(p.rank),
        correct: Number(p.correct),
        incorrect: Number(p.incorrect),
      }))}
      prizes={prizes.map(p => ({ rank: Number(p.rank), label: p.label }))}
    />
  );
}
