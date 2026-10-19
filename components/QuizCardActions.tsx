'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Pencil, Play, Trash2 } from 'lucide-react';

export default function QuizCardActions({ quizId }: { quizId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleLaunch() {
    setLoading('launch');
    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/host/${data.data.id}`);
      } else {
        alert(data.error);
      }
    } catch {
      alert('Failed to launch session');
    } finally {
      setLoading(null);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this quiz? This cannot be undone.')) return;
    setLoading('delete');
    try {
      const res = await fetch(`/api/quiz/${quizId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) router.refresh();
      else alert(data.error);
    } catch {
      alert('Failed to delete quiz');
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <button
        onClick={handleLaunch}
        disabled={!!loading}
        className="btn-primary py-2 px-4 text-sm inline-flex items-center gap-1.5"
        title="Launch live session"
      >
        <Play size={15} /> {loading === 'launch' ? 'Starting…' : 'Launch'}
      </button>
      <a
        href={`/dashboard/quiz/${quizId}`}
        className="btn-secondary py-2 px-3 text-sm inline-flex items-center gap-1.5"
        title="Edit quiz"
      >
        <Pencil size={15} />
      </a>
      <button
        onClick={handleDelete}
        disabled={!!loading}
        className="btn-secondary py-2 px-3 text-sm inline-flex items-center gap-1.5 hover:bg-red-900/30 hover:border-red-700/40 hover:text-red-300 transition-colors"
        title="Delete quiz"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
