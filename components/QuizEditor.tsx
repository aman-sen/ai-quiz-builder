'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Check, Loader2, Play, Save } from 'lucide-react';
import clsx from 'clsx';

interface Question {
  id?: string;
  text: string;
  type: string;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: string;
  points: number;
  timeLimit: number;
}

interface QuizData {
  id: string;
  title: string;
  description: string | null;
  settings: Record<string, unknown>;
  questions: Question[];
  prizes: Array<{ rank: number; label: string; description: string | null }>;
}

export default function QuizEditor({ initialData }: { initialData: QuizData }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData.title);
  const [description, setDescription] = useState(initialData.description || '');
  const [questions, setQuestions] = useState<Question[]>(initialData.questions);
  const [prizes, setPrizes] = useState(initialData.prizes.length > 0 ? initialData.prizes : [
    { rank: 1, label: '🥇 First Place', description: '' },
    { rank: 2, label: '🥈 Second Place', description: '' },
    { rank: 3, label: '🥉 Third Place', description: '' },
  ]);
  const [expandedQ, setExpandedQ] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  function updateQ(i: number, field: keyof Question, value: unknown) {
    setQuestions(qs => qs.map((q, qi) => qi === i ? { ...q, [field]: value } : q));
    setSaved(false);
  }

  function updateOption(qi: number, oi: number, value: string) {
    setQuestions(qs => qs.map((q, i) => i === qi ? { ...q, options: q.options.map((o, j) => j === oi ? value : o) } : q));
    setSaved(false);
  }

  function addQuestion() {
    setQuestions(qs => [...qs, { text: '', type: 'mcq', options: ['', '', '', ''], correctAnswer: 0, explanation: '', difficulty: 'medium', points: 100, timeLimit: 30 }]);
    setExpandedQ(questions.length);
    setSaved(false);
  }

  function removeQuestion(i: number) {
    if (questions.length <= 1) return;
    setQuestions(qs => qs.filter((_, qi) => qi !== i));
    setExpandedQ(null);
    setSaved(false);
  }

  async function handleSave(andLaunch = false) {
    if (!title.trim()) { alert('Title is required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/quiz/${initialData.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description,
          settings: initialData.settings,
          questions: questions.map(q => ({ ...q, options: q.options.map(String) })),
          prizes: prizes.filter(p => p.label.trim()),
        }),
      });
      const data = await res.json();
      if (!data.success) { alert(data.error); setSaving(false); return; }
      setSaved(true);
      if (andLaunch) {
        const sRes = await fetch('/api/session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quizId: initialData.id }),
        });
        const sData = await sRes.json();
        if (sData.success) { router.push(`/host/${sData.data.id}`); return; }
        alert(sData.error);
      }
    } catch {
      alert('Save failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 lg:p-8 max-w-3xl">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display font-bold text-3xl">Edit Quiz</h1>
        <div className="flex gap-2">
          <button onClick={() => handleSave(false)} disabled={saving} className="btn-secondary inline-flex items-center gap-1.5 py-2 px-4 text-sm">
            {saving ? <Loader2 size={14} className="animate-spin" /> : saved ? <Check size={14} className="text-green-400" /> : <Save size={14} />}
            {saved ? 'Saved' : 'Save'}
          </button>
          <button onClick={() => handleSave(true)} disabled={saving} className="btn-primary inline-flex items-center gap-1.5 py-2 px-4 text-sm">
            <Play size={14} /> Launch
          </button>
        </div>
      </div>

      <div className="card p-6 space-y-4 mb-5">
        <div>
          <label className="label">Quiz title</label>
          <input className="input text-lg font-semibold" value={title} onChange={e => { setTitle(e.target.value); setSaved(false); }} />
        </div>
        <div>
          <label className="label">Description</label>
          <textarea className="input resize-none" rows={2} value={description} onChange={e => { setDescription(e.target.value); setSaved(false); }} />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold">{questions.length} questions</h2>
        <button onClick={addQuestion} className="btn-secondary text-sm inline-flex items-center gap-1.5 py-2 px-3"><Plus size={15} /> Add</button>
      </div>

      <div className="space-y-3 mb-6">
        {questions.map((q, qi) => (
          <div key={qi} className="card overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 cursor-pointer hover:bg-white/[0.02]" onClick={() => setExpandedQ(expandedQ === qi ? null : qi)}>
              <span className="text-white/30 font-mono text-sm w-6 shrink-0">{qi + 1}</span>
              <span className="flex-1 truncate text-sm">{q.text || <span className="text-white/30 italic">Untitled</span>}</span>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`badge text-xs ${q.difficulty === 'easy' ? 'bg-green-900/40 text-green-400' : q.difficulty === 'hard' ? 'bg-red-900/40 text-red-400' : 'bg-yellow-900/40 text-yellow-400'}`}>{q.difficulty}</span>
                <button onClick={e => { e.stopPropagation(); removeQuestion(qi); }} className="text-white/20 hover:text-red-400 transition-colors"><Trash2 size={14} /></button>
              </div>
            </div>
            {expandedQ === qi && (
              <div className="border-t border-white/[0.06] p-5 space-y-4">
                <div>
                  <label className="label">Question text</label>
                  <textarea className="input resize-none" rows={2} value={q.text} onChange={e => updateQ(qi, 'text', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="label">Options (click circle to set correct answer)</label>
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-3">
                      <button onClick={() => updateQ(qi, 'correctAnswer', oi)} className={clsx('w-7 h-7 rounded-full border-2 flex items-center justify-center text-xs font-bold shrink-0 transition-colors', q.correctAnswer === oi ? 'bg-green-500 border-green-500 text-white' : 'border-white/20 text-white/30 hover:border-white/40')}>
                        {String.fromCharCode(65 + oi)}
                      </button>
                      <input className="input py-2" value={opt} onChange={e => updateOption(qi, oi, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + oi)}`} />
                    </div>
                  ))}
                </div>
                <div>
                  <label className="label">Explanation</label>
                  <textarea className="input resize-none" rows={2} value={q.explanation} onChange={e => updateQ(qi, 'explanation', e.target.value)} />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Difficulty</label>
                    <select className="input py-2" value={q.difficulty} onChange={e => updateQ(qi, 'difficulty', e.target.value)}>
                      <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
                    </select>
                  </div>
                  <div><label className="label">Points</label><input className="input py-2" type="number" min={10} value={q.points} onChange={e => updateQ(qi, 'points', parseInt(e.target.value) || 100)} /></div>
                  <div><label className="label">Time (sec)</label><input className="input py-2" type="number" min={5} value={q.timeLimit} onChange={e => updateQ(qi, 'timeLimit', parseInt(e.target.value) || 30)} /></div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card p-5">
        <h3 className="font-semibold mb-3 text-sm">Prizes (optional)</h3>
        <div className="space-y-2">
          {prizes.map((prize, i) => (
            <div key={i} className="flex items-center gap-3">
              <span className="text-white/40 text-sm w-16 shrink-0">#{prize.rank} place</span>
              <input className="input py-2 text-sm" value={prize.label} onChange={e => setPrizes(ps => ps.map((p, pi) => pi === i ? { ...p, label: e.target.value } : p))} placeholder="Prize label" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
