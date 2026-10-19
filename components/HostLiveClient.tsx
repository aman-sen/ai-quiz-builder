'use client';
import { useEffect, useState, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Users, Play, SkipForward, Pause, Square, Copy, Check, Wifi, WifiOff, Trophy, BarChart3 } from 'lucide-react';
import clsx from 'clsx';

interface Question {
  id: string;
  order_index: number;
  type: string;
  text: string;
  options: string[];
  correctAnswer: number;
  timeLimit: number;
  points: number;
  difficulty: string;
  explanation: string | null;
}

interface Participant {
  id: string;
  nickname: string;
  score: number;
  rank: number;
  correct: number;
  incorrect: number;
}

interface LeaderboardEntry {
  rank: number;
  participantId: string;
  nickname: string;
  score: number;
  correct: number;
}

interface Props {
  sessionId: string;
  hostId: string;
  quizTitle: string;
  joinCode: string;
  initialStatus: string;
  initialQuestion: number;
  questions: Question[];
  initialParticipants: Participant[];
  prizes: Array<{ rank: number; label: string }>;
}

const OPTION_COLORS = ['bg-blue-600', 'bg-pink-600', 'bg-yellow-500', 'bg-green-600'];
const OPTION_LABELS = ['A', 'B', 'C', 'D'];

export default function HostLiveClient({
  sessionId, hostId, quizTitle, joinCode,
  initialStatus, initialQuestion, questions,
  initialParticipants, prizes,
}: Props) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState(initialStatus);
  const [currentQ, setCurrentQ] = useState(initialQuestion);
  const [participants, setParticipants] = useState<Participant[]>(initialParticipants);
  const [answeredCount, setAnsweredCount] = useState(0);
  const [distribution, setDistribution] = useState<Record<number, number>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showLeaderboard, setShowLeaderboard] = useState(false);
  const [quizEnded, setQuizEnded] = useState(initialStatus === 'ended');
  const [timeLeft, setTimeLeft] = useState(0);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [view, setView] = useState<'lobby' | 'question' | 'results' | 'ended'>('lobby');

  const totalQ = questions.length;
  const activeParticipants = participants.filter(p => p).length;

  // Determine view from status
  useEffect(() => {
    if (quizEnded) { setView('ended'); return; }
    if (status === 'waiting') setView('lobby');
    else if (currentQ >= 0) setView('question');
  }, [status, currentQ, quizEnded]);

  useEffect(() => {
    const socket = io({ path: '/api/socketio', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('host:join', { sessionId, hostId });
    });
    socket.on('disconnect', () => setConnected(false));

    socket.on('host:state', ({ participants: ps }: { participants: Participant[] }) => {
      setParticipants(ps);
    });

    socket.on('participant:joined', ({ participant, totalCount }: { participant: Participant; totalCount: number }) => {
      setParticipants(ps => {
        const exists = ps.find(p => p.id === participant.id);
        return exists ? ps : [...ps, participant];
      });
    });

    socket.on('participant:left', ({ participantId }: { participantId: string }) => {
      setParticipants(ps => ps.filter(p => p.id !== participantId));
    });

    socket.on('quiz:started', () => { setStatus('active'); setView('question'); });
    socket.on('quiz:paused', () => setStatus('paused'));
    socket.on('quiz:resumed', () => setStatus('active'));

    socket.on('question:started', ({ questionIndex, timeLimit }: { questionIndex: number; timeLimit: number; startedAt: string }) => {
      setCurrentQ(questionIndex);
      setAnsweredCount(0);
      setDistribution({});
      setShowLeaderboard(false);
      setView('question');
      setStatus('active');
      startTimer(timeLimit);
    });

    socket.on('answer:count', ({ answered, total }: { answered: number; total: number }) => {
      setAnsweredCount(answered);
    });

    socket.on('question:ended', ({ correctAnswer, distribution: dist, leaderboard: lb }: {
      questionIndex: number; correctAnswer: number; distribution: Record<number, number>; leaderboard: LeaderboardEntry[];
    }) => {
      setDistribution(dist);
      setLeaderboard(lb);
      setShowLeaderboard(true);
      stopTimer();
    });

    socket.on('quiz:ended', ({ leaderboard: lb }: { leaderboard: LeaderboardEntry[]; prizes: unknown[] }) => {
      setLeaderboard(lb);
      setQuizEnded(true);
      setView('ended');
      stopTimer();
    });

    return () => { socket.disconnect(); stopTimer(); };
  }, [sessionId, hostId]);

  function startTimer(seconds: number) {
    stopTimer();
    setTimeLeft(seconds);
    const end = Date.now() + seconds * 1000;
    timerRef.current = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) stopTimer();
    }, 500);
  }

  function stopTimer() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function emit(event: string, data?: unknown) {
    socketRef.current?.emit(event, data);
  }

  function handleStart() { emit('host:start', { sessionId }); }
  function handleNext() { emit('host:next', { sessionId }); }
  function handlePause() { emit('host:pause', { sessionId }); }
  function handleResume() { emit('host:resume', { sessionId }); }
  function handleEnd() { if (confirm('End quiz early?')) emit('host:end', { sessionId }); }

  function copyCode() {
    navigator.clipboard.writeText(joinCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const currentQuestion = currentQ >= 0 ? questions[currentQ] : null;
  const totalAnswers = Object.values(distribution).reduce((a, b) => a + b, 0);

  return (
    <div className="min-h-screen bg-surface-0 flex flex-col">
      {/* Top bar */}
      <div className="bg-surface-1 border-b border-white/[0.06] px-4 lg:px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display font-bold text-lg truncate max-w-xs">{quizTitle}</h1>
          <div className={clsx('badge', connected ? 'bg-green-900/40 text-green-400' : 'bg-red-900/40 text-red-400')}>
            {connected ? <><Wifi size={11} /> Live</> : <><WifiOff size={11} /> Reconnecting</>}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {status === 'waiting' && (
            <button onClick={handleStart} className="btn-primary py-2 px-5 inline-flex items-center gap-2">
              <Play size={16} /> Start Quiz
            </button>
          )}
          {status === 'active' && (
            <>
              <button onClick={handlePause} className="btn-secondary py-2 px-4 text-sm inline-flex items-center gap-1.5"><Pause size={15} /> Pause</button>
              <button onClick={handleNext} className="btn-primary py-2 px-4 text-sm inline-flex items-center gap-1.5">
                {currentQ >= totalQ - 1 ? <><Square size={15} /> End quiz</> : <><SkipForward size={15} /> Next</>}
              </button>
            </>
          )}
          {status === 'paused' && (
            <>
              <button onClick={handleResume} className="btn-primary py-2 px-4 text-sm inline-flex items-center gap-1.5"><Play size={15} /> Resume</button>
              <button onClick={handleEnd} className="btn-danger py-2 px-4 text-sm">End quiz</button>
            </>
          )}
        </div>
      </div>

      <div className="flex-1 p-4 lg:p-6">
        {/* LOBBY VIEW */}
        {view === 'lobby' && (
          <div className="max-w-2xl mx-auto text-center pt-10">
            <div className="card p-10 mb-6">
              <p className="text-white/40 text-sm mb-3 uppercase tracking-wider font-medium">Join at quizlive.app · Enter code</p>
              <div className="font-display font-extrabold text-7xl tracking-widest text-gradient mb-3">{joinCode}</div>
              <button onClick={copyCode} className="btn-secondary text-sm inline-flex items-center gap-2 mx-auto">
                {copied ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy code</>}
              </button>
            </div>
            <div className="card p-6">
              <div className="flex items-center justify-center gap-3 mb-5">
                <Users size={20} className="text-brand-400" />
                <span className="font-display font-bold text-4xl">{participants.length}</span>
                <span className="text-white/40">students joined</span>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-h-48 overflow-y-auto">
                {participants.map(p => (
                  <span key={p.id} className="badge bg-surface-2 border border-white/10 text-white/70 text-sm px-3 py-1">
                    {p.nickname}
                  </span>
                ))}
              </div>
              {participants.length === 0 && <p className="text-white/30 text-sm">Waiting for students to join…</p>}
            </div>
            {participants.length > 0 && (
              <button onClick={handleStart} className="btn-primary mt-6 text-base px-10 py-3 inline-flex items-center gap-2">
                <Play size={18} /> Start with {participants.length} student{participants.length !== 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        {/* QUESTION VIEW */}
        {view === 'question' && currentQuestion && (
          <div className="max-w-3xl mx-auto">
            {/* Progress + timer */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-white/40 text-sm">Question {currentQ + 1} / {totalQ}</span>
              <div className="flex items-center gap-4">
                <span className="text-white/40 text-sm"><Users size={14} className="inline mr-1" />{answeredCount}/{activeParticipants}</span>
                {status === 'paused' && <span className="badge bg-yellow-900/40 text-yellow-400">Paused</span>}
                {timeLeft > 0 && (
                  <div className={clsx('font-display font-bold text-3xl tabular-nums', timeLeft <= 5 ? 'text-red-400 animate-pulse' : 'text-white')}>
                    {timeLeft}s
                  </div>
                )}
              </div>
            </div>

            {/* Question card */}
            <div className="card p-6 mb-4">
              <div className="flex items-start gap-3 mb-6">
                <span className={`badge shrink-0 ${currentQuestion.difficulty === 'easy' ? 'bg-green-900/40 text-green-400' : currentQuestion.difficulty === 'hard' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}`}>
                  {currentQuestion.difficulty}
                </span>
                <p className="font-semibold text-lg leading-snug">{currentQuestion.text}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                {currentQuestion.options.map((opt, oi) => {
                  const count = distribution[oi] ?? 0;
                  const pct = totalAnswers > 0 ? Math.round(count / totalAnswers * 100) : 0;
                  const isCorrect = showLeaderboard && oi === currentQuestion.correctAnswer;
                  return (
                    <div key={oi} className={clsx('relative rounded-xl p-4 border overflow-hidden transition-colors', isCorrect ? 'border-green-500/60 bg-green-900/20' : showLeaderboard ? 'border-white/[0.06] opacity-60' : 'border-white/10 bg-surface-2')}>
                      {showLeaderboard && (
                        <div className={clsx('absolute inset-y-0 left-0 rounded-l-xl opacity-30 transition-all', OPTION_COLORS[oi])} style={{ width: `${pct}%` }} />
                      )}
                      <div className="relative flex items-center gap-3">
                        <div className={clsx('w-8 h-8 rounded-lg flex items-center justify-center font-bold text-sm shrink-0', OPTION_COLORS[oi])}>
                          {OPTION_LABELS[oi]}
                        </div>
                        <span className="text-sm flex-1">{opt}</span>
                        {showLeaderboard && <span className="text-sm font-bold text-white/60">{pct}%</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Leaderboard after answer reveal */}
            {showLeaderboard && leaderboard.length > 0 && (
              <div className="card p-5">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Trophy size={16} className="text-yellow-400" /> Leaderboard</h3>
                <div className="space-y-2">
                  {leaderboard.slice(0, 10).map((entry, i) => (
                    <div key={entry.participantId} className={clsx('flex items-center gap-3 px-3 py-2 rounded-lg', i === 0 ? 'bg-yellow-900/20 border border-yellow-700/30' : 'bg-surface-2')}>
                      <span className="font-mono text-sm text-white/40 w-5">{entry.rank}</span>
                      <span className="flex-1 font-medium text-sm">{entry.nickname}</span>
                      <span className="font-display font-bold">{entry.score}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ENDED VIEW */}
        {view === 'ended' && (
          <div className="max-w-2xl mx-auto pt-8">
            <div className="text-center mb-8">
              <div className="text-5xl mb-3">🎉</div>
              <h2 className="font-display font-bold text-3xl mb-1">Quiz Complete!</h2>
              <p className="text-white/40">{quizTitle}</p>
            </div>

            {prizes.length > 0 && leaderboard.length > 0 && (
              <div className="card p-6 mb-5">
                <h3 className="font-semibold mb-4 flex items-center gap-2"><Trophy size={16} className="text-yellow-400" /> Prizes</h3>
                <div className="space-y-3">
                  {prizes.map(prize => {
                    const winner = leaderboard.find(e => e.rank === prize.rank);
                    return winner ? (
                      <div key={prize.rank} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-surface-2">
                        <span className="font-bold text-lg">{prize.label}</span>
                        <span className="font-medium text-white/80">{winner.nickname}</span>
                        <span className="ml-auto font-display font-bold text-brand-300">{winner.score} pts</span>
                      </div>
                    ) : null;
                  })}
                </div>
              </div>
            )}

            <div className="card overflow-hidden">
              <div className="px-5 py-3 border-b border-white/[0.05] flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2"><Trophy size={16} className="text-yellow-400" /> Final leaderboard</h3>
                <span className="text-white/40 text-sm">{leaderboard.length} participants</span>
              </div>
              <div className="divide-y divide-white/[0.05]">
                {leaderboard.slice(0, 20).map((entry, i) => (
                  <div key={entry.participantId} className={clsx('flex items-center gap-4 px-5 py-3', i < 3 ? 'bg-gradient-to-r from-yellow-900/10 to-transparent' : '')}>
                    <span className="font-mono font-bold w-6 text-sm text-white/40">{entry.rank}</span>
                    <span className="font-medium flex-1">{entry.nickname}</span>
                    <span className="text-white/40 text-sm">{entry.correct} correct</span>
                    <span className="font-display font-bold text-lg">{entry.score}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
