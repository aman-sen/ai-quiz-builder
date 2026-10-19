'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, ChevronRight, ChevronLeft, Plus, Trash2, GripVertical, Check, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';

type Difficulty = 'easy' | 'medium' | 'hard';
type QType = 'mcq' | 'truefalse';

interface GeneratedQuestion {
  text: string;
  type: QType;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: Difficulty;
  points: number;
  timeLimit: number;
}

interface Config {
  numQuestions: number;
  difficulty: Difficulty;
  questionType: QType;
  timePerQuestion: number;
  pointsPerQuestion: number;
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  showExplanation: boolean;
}

const DEFAULT_CONFIG: Config = {
  numQuestions: 10,
  difficulty: 'medium',
  questionType: 'mcq',
  timePerQuestion: 30,
  pointsPerQuestion: 100,
  shuffleQuestions: false,
  shuffleOptions: false,
  negativeMarking: false,
  showExplanation: true,
};

const STEPS = ['Describe', 'Configure', 'Generate', 'Edit & Save'];

export default function NewQuizPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [prompt, setPrompt] = useState('');
  const [config, setConfig] = useState<Config>(DEFAULT_CONFIG);
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [quizTitle, setQuizTitle] = useState('');
  const [quizDesc, setQuizDesc] = useState('');
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedQ, setExpandedQ] = useState<number | null>(0);
  const [prizes, setPrizes] = useState([
    { rank: 1, label: '🥇 First Place', description: '' },
    { rank: 2, label: '🥈 Second Place', description: '' },
    { rank: 3, label: '🥉 Third Place', description: '' },
  ]);

  function setC<K extends keyof Config>(k: K, v: Config[K]) {
    setConfig(c => ({ ...c, [k]: v }));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError('');
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...config }),
      });
      const data = await res.json();
      if (!data.success) { setGenError(data.error); setGenerating(false); return; }
      setQuestions(data.data.questions.map((q: { question: string; type: QType; options: string[]; correctAnswer: number; explanation: string; difficulty: Difficulty; points: number; timeLimit: number }) => ({
        text: q.question, type: q.type, options: q.options,
        correctAnswer: q.correctAnswer, explanation: q.explanation,
        difficulty: q.difficulty, points: q.points, timeLimit: q.timeLimit,
      })));
      setQuizTitle(data.data.title);
      setQuizDesc(data.data.description);
      setStep(3);
    } catch {
      setGenError('Generation failed. Please check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  }

  function updateQ(i: number, field: keyof GeneratedQuestion, value: unknown) {
    setQuestions(qs => qs.map((q, qi) => qi === i ? { ...q, [field]: value } : q));
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: q.options.map((o, j) => j === oi ? value : o) } : q));
  }

  function addQuestion() {
    const newQ: GeneratedQuestion = {
      text: '', type: 'mcq', options: ['', '', '', ''], correctAnswer: 0,
      explanation: '', difficulty: config.difficulty, points: config.pointsPerQuestion, timeLimit: config.timePerQuestion,
    };
    setQuestions(qs => [...qs, newQ]);
    setExpandedQ(questions.length);
  }

  function removeQuestion(i: number) {
    if (questions.length <= 1) return;
    setQuestions(qs => qs.filter((_, qi) => qi !== i));
    setExpandedQ(null);
  }

  async function handleSave(andLaunch = false) {
    if (!quizTitle.trim()) { alert('Quiz title is required'); return; }
    if (questions.some(q => !q.text.trim())) { alert('All questions must have text'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: quizTitle, description: quizDesc,
          settings: {
            timePerQuestion: config.timePerQuestion,
            shuffleQuestions: config.shuffleQuestions,
            shuffleOptions: config.shuffleOptions,
            negativeMarking: config.negativeMarking,
            negativePoints: 25,
            showExplanation: config.showExplanation,
            allowLateJoin: false,
          },
          questions: questions.map(q => ({
            text: q.text, type: q.type, options: q.options,
            correctAnswer: q.correctAnswer, explanation: q.explanation,
            difficulty: q.difficulty, points: q.points, timeLimit: q.timeLimit,
          })),
          prizes: prizes.filter(p => p.label.trim()),
        }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error); setSaving(false); return; }
      if (andLaunch) {
        const sRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizId: data.data.id }),
        });
        const sData = await sRes.json();
        if (sData.success) { router.push(`/host/${sData.data.id}`); return; }
      }
      router.push('/dashboard/quizzes');
    } catch {
      alert('Save failed. Please try again.');
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-display font-bold text-3xl mb-5">Create a new quiz</h1>
        {/* Stepper */}
        <div className="flex items-center gap-0">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                onClick={() => { if (i < step && step < 3) setStep(i); if (i === 3 && questions.length > 0) setStep(3); }}
                className={clsx('flex items-center gap-2 text-sm font-medium transition-colors', i === step ? 'text-brand-400' : i < step ? 'text-white/50 hover:text-white/70 cursor-pointer' : 'text-white/20 cursor-default')}
              >
                <div className={clsx('w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold', i === step ? 'bg-brand-500 text-white' : i < step ? 'bg-brand-900/60 text-brand-400' : 'bg-surface-2 text-white/20')}>
                  {i < step ? <Check size={12} /> : i + 1}
                </div>
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && <div className={clsx('w-8 h-px mx-2', i < step ? 'bg-brand-700' : 'bg-white/10')} />}
            </div>
          ))}
        </div>
      </div>

      {/* Step 0: Describe */}
      {step === 0 && (
        <div className="space-y-5 animate-fade-in">
          <div className="card p-6">
            <label className="label text-base font-semibold text-white mb-3">Describe your quiz</label>
            <textarea
              className="input resize-none text-base leading-relaxed"
              rows={6}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder={`Examples:\n• "Create a 10-question medium quiz on Operating Systems for undergrads covering processes, threads, scheduling, and memory management."\n• "15 True/False questions about World War II for high school students."\n• "Hard MCQ quiz on React hooks and state management for senior developers."`}
              autoFocus
            />
            <p className="text-white/30 text-xs mt-2">Be specific about topic, audience, and what to cover. The more detail, the better the quiz.</p>
          </div>
          <button onClick={() => setStep(1)} disabled={prompt.trim().length < 10} className="btn-primary inline-flex items-center gap-2">
            Continue <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Step 1: Configure */}
      {step === 1 && (
        <div className="space-y-5 animate-fade-in">
          <div className="card p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Number of questions</label>
                <input className="input" type="number" min={1} max={30} value={config.numQuestions} onChange={e => setC('numQuestions', parseInt(e.target.value) || 10)} />
              </div>
              <div>
                <label className="label">Time per question (sec)</label>
                <input className="input" type="number" min={5} max={300} value={config.timePerQuestion} onChange={e => setC('timePerQuestion', parseInt(e.target.value) || 30)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Difficulty</label>
                <select className="input" value={config.difficulty} onChange={e => setC('difficulty', e.target.value as Difficulty)}>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
              <div>
                <label className="label">Question type</label>
                <select className="input" value={config.questionType} onChange={e => setC('questionType', e.target.value as QType)}>
                  <option value="mcq">Multiple Choice (4 options)</option>
                  <option value="truefalse">True / False</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Points per correct answer</label>
              <input className="input" type="number" min={10} max={1000} step={10} value={config.pointsPerQuestion} onChange={e => setC('pointsPerQuestion', parseInt(e.target.value) || 100)} />
            </div>
            <div className="grid grid-cols-2 gap-y-3">
              {([
                ['shuffleQuestions', 'Shuffle question order'],
                ['shuffleOptions', 'Shuffle answer options'],
                ['negativeMarking', 'Negative marking for wrong answers'],
                ['showExplanation', 'Show explanations after each question'],
              ] as [keyof Config, string][]).map(([k, label]) => (
                <label key={k} className="flex items-center gap-2.5 cursor-pointer select-none">
                  <div className={clsx('w-5 h-5 rounded-md border-2 flex items-center justify-center transition-colors', config[k] ? 'bg-brand-500 border-brand-500' : 'border-white/20')} onClick={() => setC(k, !config[k] as Config[typeof k])}>
                    {config[k] && <Check size={12} className="text-white" />}
                  </div>
                  <span className="text-sm text-white/70">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Prizes */}
          <div className="card p-6">
            <h3 className="font-semibold mb-4">Prizes (optional)</h3>
            <div className="space-y-3">
              {prizes.map((prize, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="text-white/40 text-sm w-16">#{prize.rank} place</span>
                  <input className="input flex-1" type="text" value={prize.label} onChange={e => setPrizes(ps => ps.map((p, pi) => pi === i ? { ...p, label: e.target.value } : p))} placeholder={`Prize label`} />
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep(0)} className="btn-secondary inline-flex items-center gap-2"><ChevronLeft size={18} /> Back</button>
            <button onClick={() => setStep(2)} className="btn-primary inline-flex items-center gap-2">Generate quiz <Sparkles size={16} /></button>
          </div>
        </div>
      )}

      {/* Step 2: Generate */}
      {step === 2 && (
        <div className="animate-fade-in">
          <div className="card p-8 text-center">
            {generating ? (
              <div>
                <div className="w-16 h-16 rounded-2xl bg-brand-900/40 border border-brand-700/30 flex items-center justify-center mx-auto mb-5">
                  <Loader2 size={32} className="text-brand-400 animate-spin" />
                </div>
                <h2 className="font-display font-bold text-xl mb-2">Generating your quiz…</h2>
                <p className="text-white/40">Claude is crafting questions based on your prompt. This takes 10-20 seconds.</p>
              </div>
            ) : genError ? (
              <div>
                <div className="w-16 h-16 rounded-2xl bg-red-900/30 border border-red-700/30 flex items-center justify-center mx-auto mb-5">
                  <AlertCircle size={32} className="text-red-400" />
                </div>
                <h2 className="font-display font-bold text-xl mb-2">Generation failed</h2>
                <p className="text-red-300/80 mb-6">{genError}</p>
                <button onClick={handleGenerate} className="btn-primary inline-flex items-center gap-2"><Sparkles size={16} /> Try again</button>
              </div>
            ) : (
              <div>
                <div className="w-16 h-16 rounded-2xl bg-gradient-brand flex items-center justify-center mx-auto mb-5">
                  <Sparkles size={32} className="text-white" />
                </div>
                <h2 className="font-display font-bold text-xl mb-2">Ready to generate</h2>
                <p className="text-white/40 mb-2"><span className="text-white font-medium">{config.numQuestions} {config.difficulty}</span> {config.questionType === 'truefalse' ? 'True/False' : 'MCQ'} questions</p>
                <p className="text-white/30 text-sm mb-8 max-w-sm mx-auto line-clamp-3">"{prompt}"</p>
                <div className="flex gap-3 justify-center">
                  <button onClick={() => setStep(1)} className="btn-secondary inline-flex items-center gap-2"><ChevronLeft size={18} /> Back</button>
                  <button onClick={handleGenerate} className="btn-primary inline-flex items-center gap-2"><Sparkles size={16} /> Generate now</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 3: Edit & Save */}
      {step === 3 && (
        <div className="space-y-5 animate-fade-in">
          <div className="card p-6 space-y-4">
            <div>
              <label className="label text-base font-semibold text-white">Quiz title</label>
              <input className="input text-lg font-semibold" value={quizTitle} onChange={e => setQuizTitle(e.target.value)} placeholder="Quiz title" />
            </div>
            <div>
              <label className="label">Description</label>
              <textarea className="input resize-none" rows={2} value={quizDesc} onChange={e => setQuizDesc(e.target.value)} placeholder="What does this quiz cover?" />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <h2 className="font-semibold">{questions.length} questions</h2>
            <button onClick={addQuestion} className="btn-secondary text-sm inline-flex items-center gap-1.5 py-2 px-3"><Plus size={15} /> Add question</button>
          </div>

          {questions.map((q, qi) => (
            <div key={qi} className="card overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02] transition-colors" onClick={() => setExpandedQ(expandedQ === qi ? null : qi)}>
                <span className="text-white/30 font-mono text-sm w-6 shrink-0">{qi + 1}</span>
                <span className="flex-1 truncate text-sm font-medium">{q.text || <span className="text-white/30 italic">Untitled question</span>}</span>
                <div className="flex items-center gap-2 shrink-0">
                  <span className={`badge text-xs ${q.difficulty === 'easy' ? 'bg-green-900/40 text-green-400' : q.difficulty === 'hard' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{q.difficulty}</span>
                  <span className="text-white/30 text-xs">{q.points}pts · {q.timeLimit}s</span>
                  <button onClick={e => { e.stopPropagation(); removeQuestion(qi); }} className="text-white/20 hover:text-red-400 transition-colors ml-1">
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {expandedQ === qi && (
                <div className="border-t border-white/[0.06] p-5 space-y-4">
                  <div>
                    <label className="label">Question text</label>
                    <textarea className="input resize-none" rows={2} value={q.text} onChange={e => updateQ(qi, 'text', e.target.value)} placeholder="Enter your question" />
                  </div>
                  <div className="space-y-2">
                    <label className="label">Answer options</label>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-3">
                        <button
                          onClick={() => updateQ(qi, 'correctAnswer', oi)}
                          className={clsx('w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors text-xs font-bold', q.correctAnswer === oi ? 'bg-green-500 border-green-500 text-white' : 'border-white/20 text-white/20 hover:border-white/40')}
                          title="Set as correct answer"
                        >
                          {String.fromCharCode(65 + oi)}
                        </button>
                        <input className="input py-2" value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                      </div>
                    ))}
                    <p className="text-white/25 text-xs">Click the circle to mark the correct answer (shown in green)</p>
                  </div>
                  <div>
                    <label className="label">Explanation (shown after answer)</label>
                    <textarea className="input resize-none" rows={2} value={q.explanation} onChange={e => updateQ(qi, 'explanation', e.target.value)} placeholder="Why is this the correct answer?" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="label">Difficulty</label>
                      <select className="input py-2" value={q.difficulty} onChange={e => updateQ(qi, 'difficulty', e.target.value)}>
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Points</label>
                      <input className="input py-2" type="number" min={10} value={q.points} onChange={e => updateQ(qi, 'points', parseInt(e.target.value) || 100)} />
                    </div>
                    <div>
                      <label className="label">Time (sec)</label>
                      <input className="input py-2" type="number" min={5} value={q.timeLimit} onChange={e => updateQ(qi, 'timeLimit', parseInt(e.target.value) || 30)} />
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-3 pt-2">
            <button onClick={() => handleSave(false)} disabled={saving} className="btn-secondary inline-flex items-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save draft
            </button>
            <button onClick={() => handleSave(true)} disabled={saving} className="btn-primary inline-flex items-center gap-2">
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} Save & Launch →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
