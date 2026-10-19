'use client';
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    const res = await signIn('credentials', { email, password, redirect: false });
    setLoading(false);
    if (res?.ok) {
      router.push('/dashboard');
    } else {
      setError('Invalid email or password.');
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-surface-0">
      <Link href="/" className="font-display font-bold text-2xl text-gradient mb-10">QuizLive</Link>
      <div className="card p-8 w-full max-w-sm">
        <h1 className="font-display font-bold text-2xl mb-1">Welcome back</h1>
        <p className="text-white/40 text-sm mb-7">Sign in to your educator account</p>
        {error && <div className="bg-red-900/30 border border-red-700/40 text-red-300 text-sm px-4 py-3 rounded-xl mb-5">{error}</div>}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@school.edu" required autoFocus />
          </div>
          <div>
            <label className="label">Password</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button type="submit" disabled={loading} className="btn-primary w-full mt-2">
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="text-center text-white/40 text-sm mt-6">
          No account? <Link href="/register" className="text-brand-400 hover:text-brand-300">Create one</Link>
        </p>
      </div>
    </div>
  );
}
