import Link from 'next/link';
import { Zap, Users, Trophy, Sparkles, ChevronRight, BookOpen, BarChart3, Clock } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-screen bg-surface-0 overflow-x-hidden">
      {/* Nav */}
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.05] bg-surface-0/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <span className="font-display font-bold text-xl text-gradient">QuizLive</span>
          <div className="flex items-center gap-3">
            <Link href="/join" className="btn-secondary text-sm py-2 px-4">Join a quiz</Link>
            <Link href="/login" className="btn-primary text-sm py-2 px-4">Sign in</Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 text-center relative">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-brand-600/10 rounded-full blur-3xl" />
        </div>
        <div className="relative max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 badge bg-brand-900/60 text-brand-300 border border-brand-700/40 mb-6 px-4 py-1.5 text-sm">
            <Sparkles size={14} />
            AI-powered quiz generation
          </div>
          <h1 className="font-display font-extrabold text-5xl sm:text-6xl leading-tight mb-6">
            Live quizzes that{' '}
            <span className="text-gradient">actually engage</span>{' '}
            your classroom
          </h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto mb-10">
            Describe your quiz in plain English. AI builds it in seconds. Launch a live session — students join instantly on any device, no account needed.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn-primary text-base px-8 py-3 inline-flex items-center gap-2">
              Start for free <ChevronRight size={18} />
            </Link>
            <Link href="/join" className="btn-secondary text-base px-8 py-3">
              Join a quiz →
            </Link>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4">
        <div className="max-w-5xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[
            { icon: Sparkles, title: 'AI Quiz Builder', desc: 'Describe your topic, difficulty, and number of questions. Claude generates a complete quiz with explanations in seconds.' },
            { icon: Zap, title: 'Real-time Sessions', desc: 'Questions appear live on every student\'s device simultaneously. Scores update instantly. No refresh needed.' },
            { icon: Users, title: 'Hundreds of Students', desc: 'WebSocket-powered architecture handles large classrooms without breaking a sweat.' },
            { icon: Trophy, title: 'Live Leaderboard', desc: 'Speed bonuses reward fast thinkers. Rankings update after every question. Configurable prizes for top performers.' },
            { icon: BarChart3, title: 'Answer Analytics', desc: 'See answer distribution per question in real time. Identify which concepts need more teaching.' },
            { icon: Clock, title: 'Timed Questions', desc: 'Each question has a countdown. Configurable per question. Auto-advances when everyone answers or time runs out.' },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="card p-6 hover:border-brand-700/40 transition-colors">
              <div className="w-10 h-10 rounded-xl bg-brand-900/50 border border-brand-700/30 flex items-center justify-center mb-4">
                <Icon size={20} className="text-brand-400" />
              </div>
              <h3 className="font-semibold text-white mb-2">{title}</h3>
              <p className="text-white/45 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 border-t border-white/[0.05]">
        <div className="max-w-3xl mx-auto text-center mb-12">
          <h2 className="font-display font-bold text-3xl mb-3">From idea to live quiz in 3 steps</h2>
          <p className="text-white/40">For educators — students just need a 6-letter code.</p>
        </div>
        <div className="max-w-4xl mx-auto grid sm:grid-cols-3 gap-6 px-4">
          {[
            { n: '1', title: 'Describe your quiz', desc: 'Tell the AI your topic, difficulty, and how many questions. It handles the rest.' },
            { n: '2', title: 'Review & edit', desc: 'Check the generated questions, tweak wording, adjust points and time limits.' },
            { n: '3', title: 'Launch & watch', desc: 'Share the 6-letter code. Students join instantly and compete in real time.' },
          ].map(({ n, title, desc }) => (
            <div key={n} className="card p-6 text-center">
              <div className="w-10 h-10 rounded-full bg-gradient-brand flex items-center justify-center mx-auto mb-4 font-display font-bold text-white">{n}</div>
              <h3 className="font-semibold mb-2">{title}</h3>
              <p className="text-white/40 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 px-4 border-t border-white/[0.05] text-center">
        <h2 className="font-display font-bold text-3xl mb-4">Ready to run your first live quiz?</h2>
        <p className="text-white/40 mb-8">Free to use. No credit card required.</p>
        <Link href="/register" className="btn-primary text-base px-10 py-3 inline-flex items-center gap-2">
          Create your account <ChevronRight size={18} />
        </Link>
      </section>

      <footer className="border-t border-white/[0.05] py-8 px-4 text-center text-white/25 text-sm">
        © {new Date().getFullYear()} QuizLive. Built with AI.
      </footer>
    </div>
  );
}
