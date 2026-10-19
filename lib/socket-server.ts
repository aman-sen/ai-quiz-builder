/**
 * Socket.IO server — async version using @libsql/client.
 *
 * Room layout:
 *   session:{id}      – all participants + host
 *   host:{id}         – host only
 *   participant:{id}  – individual participant (for private result delivery)
 */

import { Server as SocketServer, Socket } from 'socket.io';
import { Server as HttpServer } from 'http';
import { getDb, query, queryOne, execute, batch } from './db';
import { calculateScore, computeRankings } from './scoring';
import type { QuestionForClient, LeaderboardEntry, RTQuestionEnded, RTParticipantResult } from '@/types';

// In-memory state per active session (avoids DB reads on every answer burst)
interface SessionState {
  questionTimers: Map<number, NodeJS.Timeout>;
  submittedParticipants: Set<string>;  // participantId — idempotency guard
}

const sessionStates = new Map<string, SessionState>();

function getState(sessionId: string): SessionState {
  if (!sessionStates.has(sessionId)) {
    sessionStates.set(sessionId, { questionTimers: new Map(), submittedParticipants: new Set() });
  }
  return sessionStates.get(sessionId)!;
}

function clearState(sessionId: string) {
  const s = sessionStates.get(sessionId);
  if (s) for (const t of s.questionTimers.values()) clearTimeout(t);
  sessionStates.delete(sessionId);
}

// ──────────────────────────────────────────────────────────────────────────────
export function initSocketServer(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    path: '/api/socketio',
  });

  io.on('connection', (socket: Socket) => {

    // ── HOST JOINS ────────────────────────────────────────────────────────────
    socket.on('host:join', async ({ sessionId, hostId }: { sessionId: string; hostId: string }) => {
      const s = await queryOne<{ id: string }>(
        'SELECT id FROM quiz_sessions WHERE id = ? AND host_id = ?', [sessionId, hostId]
      );
      if (!s) { socket.emit('error', { message: 'Session not found or unauthorized' }); return; }

      socket.join(`session:${sessionId}`);
      socket.join(`host:${sessionId}`);
      socket.data = { role: 'host', sessionId, hostId };

      const participants = await query('SELECT * FROM participants WHERE session_id = ? AND is_active = 1', [sessionId]);
      const session = await queryOne('SELECT * FROM quiz_sessions WHERE id = ?', [sessionId]);
      socket.emit('host:state', { participants, session });
    });

    // ── PARTICIPANT JOINS (reconnect-safe) ────────────────────────────────────
    socket.on('participant:join', async ({ sessionId, participantId }: { sessionId: string; participantId: string }) => {
      const participant = await queryOne<{ id: string; nickname: string }>(
        'SELECT * FROM participants WHERE id = ? AND session_id = ?', [participantId, sessionId]
      );
      if (!participant) { socket.emit('error', { message: 'Participant not found' }); return; }

      socket.join(`session:${sessionId}`);
      socket.join(`participant:${participantId}`);
      socket.data = { role: 'participant', sessionId, participantId };

      // Mark active on reconnect
      await execute('UPDATE participants SET is_active = 1 WHERE id = ?', [participantId]);

      const totalCount = await countActive(sessionId);
      io.to(`host:${sessionId}`).emit('participant:joined', { participant, totalCount });

      // Reconnect mid-quiz: send the current question
      const sess = await queryOne<{ status: string; current_question: number; question_started_at: string | null; quiz_id: string }>(
        'SELECT * FROM quiz_sessions WHERE id = ?', [sessionId]
      );
      if (sess?.status === 'active' && Number(sess.current_question) >= 0) {
        const question = await queryOne<DbQuestion>(
          'SELECT * FROM questions WHERE quiz_id = ? AND order_index = ?',
          [sess.quiz_id, sess.current_question]
        );
        if (question) {
          const elapsed = sess.question_started_at
            ? (Date.now() - new Date(sess.question_started_at).getTime()) / 1000
            : 0;
          socket.emit('question:started', {
            questionIndex: Number(sess.current_question),
            question: safeQuestion(question),
            timeLimit: Number(question.time_limit),
            startedAt: sess.question_started_at,
            timeRemaining: Math.max(0, Number(question.time_limit) - elapsed),
          });
        }
      }
    });

    // ── HOST: START QUIZ ──────────────────────────────────────────────────────
    socket.on('host:start', async ({ sessionId }: { sessionId: string }) => {
      if (!assertHost(socket, sessionId)) return;
      await execute("UPDATE quiz_sessions SET status = 'active', updated_at = datetime('now') WHERE id = ?", [sessionId]);
      io.to(`session:${sessionId}`).emit('quiz:started', { sessionId });
      await startQuestion(io, sessionId, 0);
    });

    // ── HOST: NEXT QUESTION ───────────────────────────────────────────────────
    socket.on('host:next', async ({ sessionId }: { sessionId: string }) => {
      if (!assertHost(socket, sessionId)) return;
      const sess = await queryOne<{ current_question: number; quiz_id: string }>(
        'SELECT current_question, quiz_id FROM quiz_sessions WHERE id = ?', [sessionId]
      );
      if (!sess) return;

      const total = await countQuestions(String(sess.quiz_id));
      const nextQ = Number(sess.current_question) + 1;
      await endQuestion(io, sessionId, Number(sess.current_question));
      setTimeout(async () => {
        if (nextQ >= total) await endQuiz(io, sessionId);
        else await startQuestion(io, sessionId, nextQ);
      }, 3000);
    });

    // ── HOST: PAUSE / RESUME ──────────────────────────────────────────────────
    socket.on('host:pause', async ({ sessionId }: { sessionId: string }) => {
      if (!assertHost(socket, sessionId)) return;
      await execute("UPDATE quiz_sessions SET status = 'paused', updated_at = datetime('now') WHERE id = ?", [sessionId]);
      io.to(`session:${sessionId}`).emit('quiz:paused');
    });

    socket.on('host:resume', async ({ sessionId }: { sessionId: string }) => {
      if (!assertHost(socket, sessionId)) return;
      await execute("UPDATE quiz_sessions SET status = 'active', updated_at = datetime('now') WHERE id = ?", [sessionId]);
      io.to(`session:${sessionId}`).emit('quiz:resumed');
    });

    // ── HOST: END QUIZ EARLY ──────────────────────────────────────────────────
    socket.on('host:end', async ({ sessionId }: { sessionId: string }) => {
      if (!assertHost(socket, sessionId)) return;
      await endQuiz(io, sessionId);
    });

    // ── PARTICIPANT: SUBMIT ANSWER ────────────────────────────────────────────
    socket.on('participant:answer', async ({
      sessionId, participantId, questionId, selectedOption,
    }: { sessionId: string; participantId: string; questionId: string; selectedOption: number }) => {

      const state = getState(sessionId);

      // In-memory idempotency check (fast path for burst submissions)
      if (state.submittedParticipants.has(participantId)) {
        socket.emit('answer:rejected', { reason: 'Already submitted' });
        return;
      }

      // Validate session is active
      const sess = await queryOne<{ status: string; current_question: number; question_started_at: string | null }>(
        'SELECT status, current_question, question_started_at FROM quiz_sessions WHERE id = ?', [sessionId]
      );
      if (!sess || sess.status !== 'active') {
        socket.emit('answer:rejected', { reason: 'Session not active' });
        return;
      }

      // Validate question is current
      const question = await queryOne<DbQuestion>('SELECT * FROM questions WHERE id = ?', [questionId]);
      if (!question || Number(question.order_index) !== Number(sess.current_question)) {
        socket.emit('answer:rejected', { reason: 'Not the current question' });
        return;
      }

      // Timer check
      const timeTaken = sess.question_started_at
        ? (Date.now() - new Date(sess.question_started_at).getTime()) / 1000
        : 0;
      if (timeTaken > Number(question.time_limit) + 1) {
        socket.emit('answer:rejected', { reason: 'Time expired' });
        return;
      }

      // DB-level idempotency (belt + suspenders)
      const existing = await queryOne('SELECT id FROM answers WHERE participant_id = ? AND question_id = ?', [participantId, questionId]);
      if (existing) {
        state.submittedParticipants.add(participantId); // sync up in-memory state
        socket.emit('answer:rejected', { reason: 'Already submitted' });
        return;
      }

      // Validate participant
      const participant = await queryOne<{ id: string; score: number; correct: number; incorrect: number; joined_at: string; nickname: string }>(
        'SELECT * FROM participants WHERE id = ? AND session_id = ?', [participantId, sessionId]
      );
      if (!participant) { socket.emit('answer:rejected', { reason: 'Participant not found' }); return; }

      // Score calculation
      const quizSettings = await queryOne<{ settings: string }>(
        'SELECT q.settings FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?', [sessionId]
      );
      const settings = quizSettings ? JSON.parse(quizSettings.settings) : {};
      const isCorrect = Number(selectedOption) === Number(question.correct_answer);
      const pointsEarned = calculateScore(isCorrect, timeTaken, {
        basePoints: Number(question.points),
        timeLimit: Number(question.time_limit),
        negativeMarking: settings.negativeMarking ?? false,
        negativePoints: settings.negativePoints ?? 25,
        speedBonusEnabled: true,
      });

      // Persist atomically
      const answerId = genId();
      await batch([
        {
          sql: `INSERT INTO answers (id, session_id, participant_id, question_id, selected_option, is_correct, points_earned, time_taken)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [answerId, sessionId, participantId, questionId, selectedOption, isCorrect ? 1 : 0, pointsEarned, timeTaken],
        },
        {
          sql: `UPDATE participants SET
                  score = score + ?,
                  correct = correct + ?,
                  incorrect = incorrect + ?
                WHERE id = ?`,
          args: [pointsEarned, isCorrect ? 1 : 0, isCorrect ? 0 : 1, participantId],
        },
      ]);

      state.submittedParticipants.add(participantId);
      socket.emit('answer:accepted', { isCorrect, pointsEarned, timeTaken });

      // Notify host of answer count
      const totalActive = await countActive(sessionId);
      io.to(`host:${sessionId}`).emit('answer:count', {
        answered: state.submittedParticipants.size,
        total: totalActive,
      });

      // Auto-advance if everyone has answered
      if (state.submittedParticipants.size >= totalActive && totalActive > 0) {
        const total = await countQuestions(String(question.quiz_id));
        const nextQ = Number(sess.current_question) + 1;
        await endQuestion(io, sessionId, Number(sess.current_question));
        setTimeout(async () => {
          if (nextQ >= total) await endQuiz(io, sessionId);
          else await startQuestion(io, sessionId, nextQ);
        }, 3000);
      }
    });

    // ── DISCONNECT ────────────────────────────────────────────────────────────
    socket.on('disconnect', async () => {
      if (socket.data?.role === 'participant' && socket.data.participantId) {
        await execute('UPDATE participants SET is_active = 0 WHERE id = ?', [socket.data.participantId]);
        if (socket.data.sessionId) {
          io.to(`host:${socket.data.sessionId}`).emit('participant:left', { participantId: socket.data.participantId });
        }
      }
    });
  });

  return io;
}

// ── HELPERS ───────────────────────────────────────────────────────────────────

type DbQuestion = {
  id: string; quiz_id: string; order_index: number; type: string;
  text: string; options: string; correct_answer: number;
  explanation: string | null; difficulty: string; points: number; time_limit: number;
};

async function startQuestion(
  io: ReturnType<typeof initSocketServer>,
  sessionId: string,
  questionIndex: number
) {
  const state = getState(sessionId);
  state.submittedParticipants.clear();

  // Clear any old timer for previous question
  const oldTimer = state.questionTimers.get(questionIndex - 1);
  if (oldTimer) { clearTimeout(oldTimer); state.questionTimers.delete(questionIndex - 1); }

  const quizRow = await queryOne<{ id: string; settings: string }>(
    'SELECT q.id, q.settings FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?', [sessionId]
  );
  if (!quizRow) return;

  const question = await queryOne<DbQuestion>(
    'SELECT * FROM questions WHERE quiz_id = ? AND order_index = ?', [quizRow.id, questionIndex]
  );
  if (!question) return;

  const startedAt = new Date().toISOString();
  await execute(
    "UPDATE quiz_sessions SET current_question = ?, question_started_at = ?, status = 'active', updated_at = datetime('now') WHERE id = ?",
    [questionIndex, startedAt, sessionId]
  );

  // Broadcast question WITHOUT correct answer
  io.to(`session:${sessionId}`).emit('question:started', {
    questionIndex,
    question: safeQuestion(question),
    timeLimit: Number(question.time_limit),
    startedAt,
  });

  // Auto-end after time limit expires
  const timer = setTimeout(async () => {
    state.questionTimers.delete(questionIndex);
    const currentSess = await queryOne<{ status: string }>(
      'SELECT status FROM quiz_sessions WHERE id = ?', [sessionId]
    );
    if (!currentSess || currentSess.status === 'ended') return;

    await endQuestion(io, sessionId, questionIndex);

    const total = await countQuestions(String(quizRow.id));
    const nextQ = questionIndex + 1;
    setTimeout(async () => {
      if (nextQ >= total) await endQuiz(io, sessionId);
      else await startQuestion(io, sessionId, nextQ);
    }, 3000);
  }, (Number(question.time_limit) + 1) * 1000);

  state.questionTimers.set(questionIndex, timer);
}

async function endQuestion(
  io: ReturnType<typeof initSocketServer>,
  sessionId: string,
  questionIndex: number
) {
  const state = getState(sessionId);
  const timer = state.questionTimers.get(questionIndex);
  if (timer) { clearTimeout(timer); state.questionTimers.delete(questionIndex); }

  const quizRow = await queryOne<{ id: string }>(
    'SELECT q.id FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?', [sessionId]
  );
  if (!quizRow) return;

  const question = await queryOne<DbQuestion>(
    'SELECT * FROM questions WHERE quiz_id = ? AND order_index = ?', [quizRow.id, questionIndex]
  );
  if (!question) return;

  // Answer distribution
  const distRows = await query<{ selected_option: number; cnt: number }>(
    'SELECT selected_option, COUNT(*) as cnt FROM answers WHERE session_id = ? AND question_id = ? GROUP BY selected_option',
    [sessionId, question.id]
  );
  const distribution: Record<number, number> = {};
  for (const row of distRows) distribution[Number(row.selected_option)] = Number(row.cnt);

  // Compute and persist rankings
  const participants = await query<{
    id: string; nickname: string; score: number; correct: number; incorrect: number; joined_at: string;
  }>('SELECT * FROM participants WHERE session_id = ? AND is_active = 1', [sessionId]);

  const rankings = computeRankings(participants);
  const rankBatch = rankings.map(r => ({
    sql: 'UPDATE participants SET rank = ? WHERE id = ?',
    args: [r.rank, r.id] as [number, string],
  }));
  if (rankBatch.length > 0) await batch(rankBatch);

  // Build leaderboard (top 20 for broadcast)
  const leaderboard: LeaderboardEntry[] = participants
    .map(p => {
      const r = rankings.find(r => r.id === p.id);
      return { rank: r?.rank ?? 0, participantId: p.id, nickname: p.nickname, score: Number(p.score), correct: Number(p.correct), incorrect: Number(p.incorrect) };
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20);

  const payload: RTQuestionEnded = {
    questionIndex,
    correctAnswer: Number(question.correct_answer),
    explanation: question.explanation ?? undefined,
    distribution,
    leaderboard,
  };
  io.to(`session:${sessionId}`).emit('question:ended', payload);

  // Send personal result to each participant
  const allAnswers = await query<{ participant_id: string; is_correct: number; points_earned: number }>(
    'SELECT participant_id, is_correct, points_earned FROM answers WHERE session_id = ? AND question_id = ?',
    [sessionId, question.id]
  );

  const answeredIds = new Set(allAnswers.map(a => String(a.participant_id)));

  for (const p of participants) {
    const answer = allAnswers.find(a => String(a.participant_id) === p.id);
    const rank = rankings.find(r => r.id === p.id)?.rank ?? 0;
    const result: RTParticipantResult = {
      isCorrect: answer ? Number(answer.is_correct) === 1 : false,
      pointsEarned: answer ? Number(answer.points_earned) : 0,
      totalScore: Number(p.score),
      rank,
      correctAnswer: Number(question.correct_answer),
      explanation: question.explanation ?? undefined,
    };
    io.to(`participant:${p.id}`).emit('participant:result', result);
  }
}

async function endQuiz(io: ReturnType<typeof initSocketServer>, sessionId: string) {
  await execute(
    "UPDATE quiz_sessions SET status = 'ended', ended_at = datetime('now'), updated_at = datetime('now') WHERE id = ?",
    [sessionId]
  );

  const participants = await query<{
    id: string; nickname: string; score: number; correct: number; incorrect: number; joined_at: string;
  }>('SELECT * FROM participants WHERE session_id = ? ORDER BY score DESC', [sessionId]);

  const rankings = computeRankings(participants);
  if (rankings.length > 0) {
    await batch(rankings.map(r => ({
      sql: 'UPDATE participants SET rank = ? WHERE id = ?',
      args: [r.rank, r.id] as [number, string],
    })));
  }

  const leaderboard: LeaderboardEntry[] = participants
    .map(p => {
      const r = rankings.find(r => r.id === p.id);
      return { rank: r?.rank ?? 0, participantId: p.id, nickname: p.nickname, score: Number(p.score), correct: Number(p.correct), incorrect: Number(p.incorrect) };
    })
    .sort((a, b) => a.rank - b.rank);

  const quizRow = await queryOne<{ id: string }>(
    'SELECT q.id FROM quiz_sessions s JOIN quizzes q ON q.id = s.quiz_id WHERE s.id = ?', [sessionId]
  );
  const prizes = quizRow ? await query('SELECT * FROM prizes WHERE quiz_id = ? ORDER BY rank', [quizRow.id]) : [];

  io.to(`session:${sessionId}`).emit('quiz:ended', { leaderboard, prizes });
  clearState(sessionId);
}

function safeQuestion(q: DbQuestion): QuestionForClient {
  return {
    id: q.id, orderIndex: Number(q.order_index), type: q.type as 'mcq' | 'truefalse',
    text: q.text, options: JSON.parse(q.options),
    difficulty: q.difficulty as 'easy' | 'medium' | 'hard',
    points: Number(q.points), timeLimit: Number(q.time_limit),
  };
}

function assertHost(socket: Socket, sessionId: string): boolean {
  if (socket.data?.role !== 'host' || socket.data.sessionId !== sessionId) {
    socket.emit('error', { message: 'Unauthorized' });
    return false;
  }
  return true;
}

async function countActive(sessionId: string): Promise<number> {
  const r = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM participants WHERE session_id = ? AND is_active = 1', [sessionId]);
  return Number(r?.c ?? 0);
}

async function countQuestions(quizId: string): Promise<number> {
  const r = await queryOne<{ c: number }>('SELECT COUNT(*) as c FROM questions WHERE quiz_id = ?', [quizId]);
  return Number(r?.c ?? 0);
}

function genId(): string {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36);
}
