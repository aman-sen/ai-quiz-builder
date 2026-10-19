import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { generateQuiz } from '@/lib/ai';
import { AIQuizGenerationRequest } from '@/types';

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json() as Partial<AIQuizGenerationRequest>;

    if (!body.prompt || typeof body.prompt !== 'string' || body.prompt.trim().length < 10) {
      return NextResponse.json({ success: false, error: 'Please provide a more detailed prompt (at least 10 characters)' }, { status: 400 });
    }

    const request: AIQuizGenerationRequest = {
      prompt: body.prompt.trim().slice(0, 2000),
      numQuestions: Math.min(Math.max(parseInt(String(body.numQuestions ?? 10)), 1), 30),
      difficulty: ['easy', 'medium', 'hard'].includes(body.difficulty!) ? body.difficulty! : 'medium',
      questionType: body.questionType === 'truefalse' ? 'truefalse' : 'mcq',
      timePerQuestion: Math.min(Math.max(parseInt(String(body.timePerQuestion ?? 30)), 5), 300),
      pointsPerQuestion: Math.min(Math.max(parseInt(String(body.pointsPerQuestion ?? 100)), 10), 1000),
    };

    const result = await generateQuiz(request);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 422 });
    }

    return NextResponse.json({ success: true, data: result.quiz });
  } catch (err) {
    console.error('[ai/generate]', err);
    return NextResponse.json({ success: false, error: 'Generation failed. Please try again.' }, { status: 500 });
  }
}
