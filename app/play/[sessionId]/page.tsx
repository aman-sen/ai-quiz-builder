'use client';
import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { io, Socket } from 'socket.io-client';
import { Wifi, WifiOff, Trophy, CheckCircle2, XCircle, Clock } from 'lucide-react';
import clsx from 'clsx';

type Phase = 'loading' | 'waiting' | 'question' | 'answer-submitted' | 'question-ended' | 'quiz-ended';

interface QuestionData {
  id: string;
  orderIndex: number;
  type: string;
  text: string;
  options: string[];
  timeLimit: number;
  points: number;
}

interface PersonalResult {
  isCorrect: boolean;
  pointsEarned: number;
  totalScore: number;
  rank: number;
  correctAnswer: number;
  explanation?: string;
}

interface FinalResult {
  rank: number;
  score: number;
  correct: number;
  prizes: Array<{ rank: number; label: string }>;
  leaderboard: Array<{ rank: number; nickname: string; score: number }>;
}

const OPTION_COLORS = [
  'bg-blue-600 hover:bg-blue-500 border-blue-500',
  'bg-pink-600 hover:bg-pink-500 border-pink-500',
  'bg-yellow-500 hover:bg-yellow-400 border-yellow-400',
  'bg-green-600 hover:bg-green-500 border-green-500',
];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function PlayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const participantId = searchParams.get('pid');
  const [sessionId, setSessionId] = useState('');

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [phase, setPhase] = useState<Phase>('loading');
  const [quizTitle, setQuizTitle] = useState('');
  const [nickname, setNickname] = useState('');
  const [totalQuestions, setTotalQuestions] = useState(0);

  const [currentQuestion, setCurrentQuestion] = useState<QuestionData | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const [personalResult, setPersonalResult] = useState<PersonalResult | null>(null);
  const [finalResult, setFinalResult] = useState<FinalResult | null>(null);

  // Load participant info from sessionStorage
  useEffect(() => {
    const stored = sessionStorage.getItem('participant');
    if (!stored || !participantId) {
      router.push('/join');
      return;
    }
    try {
      const data = JSON.parse(stored);
      if (data.participantId !== participantId) { router.push('/join'); return; }
      setSessionId(data.sessionId);
      setNickname(data.nickname);
      setQuizTitle(data.quizTitle || '');
      setTotalQuestions(data.questionCount || 0);
    } catch {
      router.push('/join');
    }
  }, [participantId, router]);

  useEffect(() => {
    if (!sessionId || !participantId) return;

    const socket = io({ path: '/api/socketio', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('participant:join', { sessionId, participantId });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('quiz:started', () => setPhase('waiting'));

    socket.on('question:started', ({ question, questionIndex: qi, timeLimit, startedAt, timeRemaining }: {
      question: QuestionData; questionIndex: number; timeLimit: number; startedAt: string; timeRemaining?: number;
    }) => {
      setCurrentQuestion(question);
      setQuestionIndex(qi);
      setSelectedOption(null);
      setSubmitted(false);
      setPersonalResult(null);
      setPhase('question');
      const t = timeRemaining ?? timeLimit;
      startTimer(t);
    });

    socket.on('answer:accepted', () => setPhase('answer-submitted'));
    socket.on('answer:rejected', ({ reason }: { reason: string }) => {
      console.warn('Answer rejected:', reason);
    });

    socket.on('participant:result', (result: PersonalResult) => {
      setPersonalResult(result);
      setPhase('question-ended');
      stopTimer();
    });

    socket.on('question:ended', ({ correctAnswer }: { correctAnswer: number }) => {
      // If we didn't get participant:result yet, show the question-ended state
      setPhase(p => p === 'question' || p === 'answer-submitted' ? 'question-ended' : p);
      stopTimer();
    });

    socket.on('quiz:paused', () => {});
    socket.on('quiz:resumed', () => {});

    socket.on('quiz:ended', ({ leaderboard, prizes }: { leaderboard: Array<{ rank: number; participantId: string; nickname: string; score: number; correct: number }>; prizes: Array<{ rank: number; label: string }> }) => {
      const myEntry = leaderboard.find(e => e.participantId === participantId);
      const myNick = sessionStorage.getItem('participant') ? JSON.parse(sessionStorage.getItem('participant')!).nickname : '';
      const myLbEntry = leaderboard.find(e => e.nickname === myNick);
      setFinalResult({
        rank: myEntry?.rank ?? myLbEntry?.rank ?? 0,
        score: myEntry?.score ?? myLbEntry?.score ?? 0,
        correct: myEntry?.correct ?? myLbEntry?.correct ?? 0,
        prizes,
        leaderboard: leaderboard.slice(0, 10),
      });
      setPhase('quiz-ended');
      stopTimer();
    });

    // First phase depends on session status
    setPhase('waiting');

    return () => { socket.disconnect(); stopTimer(); };
  }, [sessionId, participantId]);

  function startTimer(seconds: number) {
    stopTimer();
    setTimeLeft(Math.ceil(seconds));
    const end = Date.now() + seconds * 1000;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) stopTimer();
    }, 250);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function submitAnswer(optionIndex: number) {
    if (submitted || !currentQuestion || !socketRef.current) return;
    setSelectedOption(optionIndex);
    setSubmitted(true);
    socketRef.current.emit('participant:answer', {
      sessionId,
      participantId,
      questionId: currentQuestion.id,
      selectedOption: optionIndex,
    });
    setPhase('answer-submitted');
    stopTimer();
  }

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      {/* Status bar */}
      <div className="px-4 h-12 flex items-center justify-between border-b border-white/[0.05]">
        <span className="font-display font-bold text-gradient text-sm">QuizLive</span>
        <div className="flex items-center gap-3">
          {nickname && <span className="text-white/40 text-xs font-medium">{nickname}</span>}
          <div className={clsx('w-2 h-2 rounded-full', connected ? 'bg-green-400' : 'bg-red-400')} />
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-6 max-w-lg mx-auto w-full">

        {/* LOADING */}
        {phase === 'loading' && (
          <div className="text-center">
            <div className="w-12 h-12 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/40">Connecting…</p>
          </div>
        )}

        {/* WAITING */}
        {phase === 'waiting' && (
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-gradient-brand flex items-center justify-center mx-auto mb-6 animate-pulse-ring">
              <span className="text-3xl">🎯</span>
            </div>
            <h1 className="font-display font-bold text-2xl mb-2">{quizTitle || "You're in!"}</h1>
            <p className="text-white/50 mb-2">Waiting for the host to start…</p>
            <p className="text-brand-400 font-medium">{nickname}</p>
            {totalQuestions > 0 && <p className="text-white/30 text-sm mt-4">{totalQuestions} questions ready</p>}
          </div>
        )}

        {/* QUESTION */}
        {phase === 'question' && currentQuestion && (
          <div className="w-full animate-slide-up">
            {/* Progress + timer */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-white/40 text-xs">Question {questionIndex + 1}{totalQuestions > 0 ? ` / ${totalQuestions}` : ''}</span>
              <div className={clsx('font-display font-bold text-2xl tabular-nums', timeLeft <= 5 ? 'text-red-400' : 'text-white')}>
                {timeLeft}s
              </div>
            </div>

            {/* Timer bar */}
            <div className="h-1.5 bg-surface-2 rounded-full mb-6 overflow-hidden">
              <div
                className={clsx('h-full rounded-full transition-all', timeLeft <= 5 ? 'bg-red-500' : 'bg-brand-500')}
                style={{ width: currentQuestion.timeLimit > 0 ? `${(timeLeft / currentQuestion.timeLimit) * 100}%` : '100%', transition: 'width 1s linear' }}
              />
            </div>

            {/* Question text */}
            <div className="card p-5 mb-5">
              <p className="font-semibold text-base sm:text-lg leading-snug">{currentQuestion.text}</p>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {currentQuestion.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => submitAnswer(i)}
                  disabled={submitted}
                  className={clsx('relative rounded-2xl border p-4 text-left text-sm font-medium transition-all active:scale-95 disabled:cursor-not-allowed',
                    submitted && selectedOption === i ? 'opacity-100 scale-[1.01]' : submitted ? 'opacity-40' : 'active:opacity-80',
                    OPTION_COLORS[i])}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-black/20 flex items-center justify-center font-bold text-sm shrink-0">
                      {OPTION_LABELS[i]}
                    </div>
                    <span className="leading-snug">{opt}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ANSWER SUBMITTED */}
        {phase === 'answer-submitted' && (
          <div className="text-center animate-fade-in">
            <div className="w-20 h-20 rounded-3xl bg-brand-900/40 border border-brand-700/30 flex items-center justify-center mx-auto mb-6">
              <Clock size={36} className="text-brand-400 animate-pulse" />
            </div>
            <h2 className="font-display font-bold text-2xl mb-2">Answer locked in!</h2>
            <p className="text-white/40">Waiting for others to answer…</p>
            {currentQuestion && (
              <div className="mt-4 badge bg-surface-2 border border-white/10 text-white/50 text-sm px-4 py-2">
                You chose: {OPTION_LABELS[selectedOption ?? 0]} · {currentQuestion.options[selectedOption ?? 0]}
              </div>
            )}
          </div>
        )}

        {/* QUESTION ENDED - show result */}
        {phase === 'question-ended' && (
          <div className="w-full animate-slide-up">
            {personalResult ? (
              <>
                <div className={clsx('w-full rounded-3xl p-6 text-center mb-5', personalResult.isCorrect ? 'bg-green-900/30 border border-green-700/30' : 'bg-red-900/20 border border-red-700/20')}>
                  {personalResult.isCorrect ? (
                    <CheckCircle2 size={48} className="text-green-400 mx-auto mb-3" />
                  ) : (
                    <XCircle size={48} className="text-red-400 mx-auto mb-3" />
                  )}
                  <h2 className="font-display font-bold text-2xl mb-1">
                    {personalResult.isCorrect ? 'Correct! 🎉' : 'Not quite'}
                  </h2>
                  {personalResult.isCorrect && (
                    <p className="text-green-300 font-bold text-lg">+{personalResult.pointsEarned} points</p>
                  )}
                </div>

                {/* Correct answer */}
                {!personalResult.isCorrect && currentQuestion && (
                  <div className="card p-4 mb-4 bg-green-900/10 border-green-700/20">
                    <p className="text-white/50 text-xs mb-1">Correct answer</p>
                    <p className="font-medium text-green-300">{currentQuestion.options[personalResult.correctAnswer]}</p>
                  </div>
                )}

                {/* Explanation */}
                {personalResult.explanation && (
                  <div className="card p-4 mb-4">
                    <p className="text-white/40 text-xs mb-1 uppercase tracking-wider">Explanation</p>
                    <p className="text-sm text-white/80 leading-relaxed">{personalResult.explanation}</p>
                  </div>
                )}

                {/* Score + rank */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="card p-4 text-center">
                    <div className="font-display font-bold text-3xl text-brand-300">{personalResult.totalScore}</div>
                    <div className="text-white/40 text-xs mt-1">Total score</div>
                  </div>
                  <div className="card p-4 text-center">
                    <div className="font-display font-bold text-3xl flex items-center justify-center gap-1">
                      <Trophy size={20} className="text-yellow-400" /> #{personalResult.rank}
                    </div>
                    <div className="text-white/40 text-xs mt-1">Current rank</div>
                  </div>
                </div>

                <p className="text-center text-white/25 text-sm mt-5">Waiting for next question…</p>
              </>
            ) : (
              <div className="text-center">
                <p className="text-white/40">Time's up! Loading results…</p>
              </div>
            )}
          </div>
        )}

        {/* QUIZ ENDED */}
        {phase === 'quiz-ended' && finalResult && (
          <div className="w-full animate-slide-up">
            <div className="text-center mb-6">
              <div className="text-5xl mb-3">
                {finalResult.rank === 1 ? '🏆' : finalResult.rank === 2 ? '🥈' : finalResult.rank === 3 ? '🥉' : '🎯'}
              </div>
              <h1 className="font-display font-bold text-3xl mb-1">Quiz over!</h1>
              <p className="text-white/40">{quizTitle}</p>
            </div>

            {/* Prize */}
            {finalResult.prizes.find(p => p.rank === finalResult.rank) && (
              <div className="card p-5 mb-5 bg-yellow-900/20 border-yellow-700/30 text-center">
                <div className="text-2xl mb-1">{finalResult.prizes.find(p => p.rank === finalResult.rank)!.label}</div>
                <p className="text-yellow-300 font-medium">Congratulations, {nickname}!</p>
              </div>
            )}

            {/* Personal stats */}
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className="card p-4 text-center">
                <div className="font-display font-bold text-2xl">#{finalResult.rank}</div>
                <div className="text-white/40 text-xs mt-1">Rank</div>
              </div>
              <div className="card p-4 text-center">
                <div className="font-display font-bold text-2xl text-brand-300">{finalResult.score}</div>
                <div className="text-white/40 text-xs mt-1">Score</div>
              </div>
              <div className="card p-4 text-center">
                <div className="font-display font-bold text-2xl text-green-400">{finalResult.correct}</div>
                <div className="text-white/40 text-xs mt-1">Correct</div>
              </div>
            </div>

            {/* Leaderboard */}
            {finalResult.leaderboard.length > 0 && (
              <div className="card overflow-hidden mb-5">
                <div className="px-4 py-3 border-b border-white/[0.05]">
                  <h3 className="font-semibold text-sm flex items-center gap-2"><Trophy size={14} className="text-yellow-400" /> Top players</h3>
                </div>
                {finalResult.leaderboard.map((entry, i) => (
                  <div key={i} className={clsx('flex items-center gap-3 px-4 py-3 text-sm', i < finalResult.leaderboard.length - 1 ? 'border-b border-white/[0.04]' : '', entry.nickname === nickname ? 'bg-brand-900/20' : '')}>
                    <span className="text-white/30 w-5 font-mono">{entry.rank}</span>
                    <span className={clsx('flex-1 font-medium', entry.nickname === nickname ? 'text-brand-300' : '')}>{entry.nickname} {entry.nickname === nickname ? '(you)' : ''}</span>
                    <span className="font-bold">{entry.score}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => router.push('/join')} className="btn-secondary w-full">Play another quiz</button>
          </div>
        )}
      </div>
    </div>
  );
}
