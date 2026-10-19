'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Zap } from 'lucide-react';

export default function JoinPage() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/session/join', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ joinCode: code.trim().toUpperCase(), nickname: nickname.trim() }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.error); setLoading(false); return; }
      const { participantId, sessionId } = data.data;
      // Store in sessionStorage for the play page
      sessionStorage.setItem('participant', JSON.stringify(data.data));
      router.push(`/play/${sessionId}?pid=${participantId}`);
    } catch {
      setError('Failed to join. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surface-0">
      <Link href="/" className="font-display font-bold text-2xl text-gradient mb-10">QuizLive</Link>
      <div className="card p-8 w-full max-w-sm text-center">
        <div className="w-14 h-14 rounded-2xl bg-gradient-brand flex items-center justify-center mx-auto mb-5">
          <Zap size={28} className="text-white" />
        </div>
        <h1 className="font-display font-bold text-2xl mb-1">Join a quiz</h1>
        <p className="text-white/40 text-sm mb-7">Enter the code from your teacher's screen</p>
        {error && <div className="bg-red-900/30 border border-red-700/40 text-red-300 text-sm px-4 py-3 rounded-xl mb-5 text-left">{error}</div>}
        <form onSubmit={handleJoin} className="space-y-4 text-left">
          <div>
            <label className="label">Game code</label>
            <input
              className="input text-center text-2xl font-display font-bold tracking-[0.2em] uppercase"
              type="text"
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))}
              placeholder="ABC123"
              maxLength={6}
              required
              autoFocus
            />
          </div>
          <div>
            <label className="label">Your nickname</label>
            <input className="input text-center text-lg" type="text" value={nickname} onChange={e => setNickname(e.target.value.slice(0, 30))} placeholder="Blazing Tiger" required maxLength={30} />
          </div>
          <button type="submit" disabled={loading || code.length < 4} className="btn-primary w-full text-base py-3 mt-2">
            {loading ? 'Joining…' : 'Join now →'}
          </button>
        </form>
        <p className="text-white/25 text-xs mt-6">No account needed · Works on any device</p>
      </div>
    </div>
  );
}
