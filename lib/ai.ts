import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIGeneratedQuiz, AIGeneratedQuestion, AIQuizGenerationRequest } from '@/types';

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'your-gemini-api-key-here') {
      throw new Error('GEMINI_API_KEY is not configured');
    }
    client = new GoogleGenerativeAI(apiKey);
  }
  return client;
}

function buildPrompt(req: AIQuizGenerationRequest): string {
  const typeLabel = req.questionType === 'truefalse'
    ? 'True/False questions with exactly 2 options: ["True", "False"]'
    : 'multiple-choice questions with exactly 4 options';

  return `Generate a ${req.numQuestions}-question quiz based on this description:

"${req.prompt}"

Requirements:
- Exactly ${req.numQuestions} questions
- Question type: ${typeLabel}
- Difficulty: ${req.difficulty}
- Points per question: ${req.pointsPerQuestion}
- Time limit per question: ${req.timePerQuestion} seconds

Return ONLY valid JSON, no markdown, no explanation, no code fences. Use this exact structure:
{
  "title": "Quiz title here",
  "description": "Brief description",
  "questions": [
    {
      "question": "Question text",
      "type": "${req.questionType}",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "Why this is correct",
      "difficulty": "${req.difficulty}",
      "points": ${req.pointsPerQuestion},
      "timeLimit": ${req.timePerQuestion}
    }
  ]
}

Rules:
- correctAnswer is the 0-based index into the options array
- All questions must be unique
- Return ONLY the JSON, nothing else`;
}

export interface GenerationResult { success: true; quiz: AIGeneratedQuiz; }
export interface GenerationError { success: false; error: string; }

export async function generateQuiz(req: AIQuizGenerationRequest): Promise<GenerationResult | GenerationError> {
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({
      model: 'gemini-3.8-flash',
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json',
      },
    });
    const result = await model.generateContent(buildPrompt(req));
    const rawText = result.response.text();
    const quiz = parseAndValidate(rawText, req);
    return { success: true, quiz };
  } catch (err: unknown) {
    console.error('[AI/Gemini] Error:', err);
    if (err instanceof Error) {
      if (err.message.includes('GEMINI_API_KEY') || err.message.includes('not configured'))
        return { success: false, error: 'Gemini API key not configured. Add GEMINI_API_KEY to .env.local' };
      if (err.message.includes('429') || err.message.includes('quota'))
        return { success: false, error: 'Free quota exceeded. Try again in a minute.' };
      if (err.message.includes('SAFETY'))
        return { success: false, error: 'Topic blocked by safety filters. Try rephrasing your prompt.' };
      return { success: false, error: `Quiz generation failed: ${err.message}` };
    }
    return { success: false, error: 'Quiz generation failed. Please try again.' };
  }
}

function parseAndValidate(raw: string, req: AIQuizGenerationRequest): AIGeneratedQuiz {
  const cleaned = raw.replace(/^```json?\s*/i, '').replace(/\s*```$/i, '').trim();
  let parsed: unknown;
  try { parsed = JSON.parse(cleaned); }
  catch { throw new Error(`Invalid JSON from Gemini: ${cleaned.slice(0, 200)}`); }

  if (typeof parsed !== 'object' || parsed === null) throw new Error('Response is not an object');
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.title !== 'string' || !obj.title.trim()) throw new Error('Missing quiz title');
  if (!Array.isArray(obj.questions) || obj.questions.length === 0) throw new Error('No questions returned');

  const questions: AIGeneratedQuestion[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < obj.questions.length; i++) {
    const q = obj.questions[i] as Record<string, unknown>;
    if (typeof q.question !== 'string' || !q.question.trim()) throw new Error(`Q${i+1}: missing text`);
    const key = q.question.trim().toLowerCase();
    if (seen.has(key)) throw new Error(`Q${i+1}: duplicate`);
    seen.add(key);
    if (!Array.isArray(q.options) || q.options.length < 2) throw new Error(`Q${i+1}: need ≥2 options`);
    const options = (q.options as unknown[]).map((o, oi) => {
      if (typeof o !== 'string' || !o.trim()) throw new Error(`Q${i+1} option ${oi+1}: empty`);
      return o.trim();
    });
    if (typeof q.correctAnswer !== 'number' || q.correctAnswer < 0 || q.correctAnswer >= options.length)
      throw new Error(`Q${i+1}: correctAnswer out of range`);
    questions.push({
      question: q.question.trim(), type: req.questionType, options,
      correctAnswer: q.correctAnswer as number,
      explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
      difficulty: ['easy','medium','hard'].includes(q.difficulty as string)
        ? q.difficulty as 'easy'|'medium'|'hard' : req.difficulty,
      points: typeof q.points === 'number' && q.points > 0 ? Math.floor(q.points) : req.pointsPerQuestion,
      timeLimit: typeof q.timeLimit === 'number' && q.timeLimit > 0 ? Math.floor(q.timeLimit) : req.timePerQuestion,
    });
  }
  return {
    title: (obj.title as string).trim(),
    description: typeof obj.description === 'string' ? obj.description.trim() : '',
    questions,
  };
}