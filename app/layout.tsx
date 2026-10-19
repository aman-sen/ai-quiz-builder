import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'QuizLive — AI-Powered Live Quizzes',
  description: 'Create AI-powered quizzes and run live classroom sessions in minutes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
      </head>
      <body className="bg-surface-0 text-white antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
