// =====================
// Domain Types
// =====================

export type QuestionType = 'mcq' | 'truefalse';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type SessionStatus = 'waiting' | 'active' | 'paused' | 'ended';
export type QuizStatus = 'draft' | 'published' | 'archived';

export interface QuizSettings {
  timePerQuestion: number;     // default seconds per question
  shuffleQuestions: boolean;
  shuffleOptions: boolean;
  negativeMarking: boolean;
  negativePoints: number;      // points deducted for wrong answer
  showExplanation: boolean;
  allowLateJoin: boolean;
}

export interface Question {
  id: string;
  quizId: string;
  orderIndex: number;
  type: QuestionType;
  text: string;
  options: string[];
  correctAnswer: number;       // 0-based index — NEVER sent to client before submit
  explanation?: string;
  difficulty: Difficulty;
  points: number;
  timeLimit: number;
}

export interface Quiz {
  id: string;
  title: string;
  description?: string;
  creatorId: string;
  settings: QuizSettings;
  status: QuizStatus;
  questions: Question[];
  prizes?: Prize[];
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
}

export interface QuizSession {
  id: string;
  quizId: string;
  hostId: string;
  joinCode: string;
  status: SessionStatus;
  currentQuestion: number;
  questionStartedAt?: string;
  createdAt: string;
  endedAt?: string;
}

export interface Participant {
  id: string;
  sessionId: string;
  nickname: string;
  score: number;
  rank: number;
  correct: number;
  incorrect: number;
  joinedAt: string;
  isActive: boolean;
}

export interface Answer {
  id: string;
  sessionId: string;
  participantId: string;
  questionId: string;
  selectedOption: number;
  isCorrect: boolean;
  pointsEarned: number;
  timeTaken: number;
  submittedAt: string;
}

export interface Prize {
  id: string;
  quizId: string;
  rank: number;
  label: string;
  description?: string;
}

export interface LeaderboardEntry {
  rank: number;
  participantId: string;
  nickname: string;
  score: number;
  correct: number;
  incorrect: number;
}

// =====================
// AI Generation Types
// =====================

export interface AIQuizGenerationRequest {
  prompt: string;
  numQuestions: number;
  difficulty: Difficulty;
  questionType: QuestionType;
  timePerQuestion: number;
  pointsPerQuestion: number;
}

export interface AIGeneratedQuiz {
  title: string;
  description: string;
  questions: AIGeneratedQuestion[];
}

export interface AIGeneratedQuestion {
  question: string;
  type: QuestionType;
  options: string[];
  correctAnswer: number;
  explanation: string;
  difficulty: Difficulty;
  points: number;
  timeLimit: number;
}

// =====================
// Real-time Event Types
// =====================

export interface RTStudentJoined {
  participant: Participant;
  totalCount: number;
}

export interface RTQuizStarted {
  sessionId: string;
}

export interface RTQuestionStarted {
  questionIndex: number;
  question: QuestionForClient; // no correctAnswer
  timeLimit: number;
  startedAt: string;
}

export interface RTAnswerSubmitted {
  participantId: string;
  questionIndex: number;
  answeredCount: number;
  totalCount: number;
}

export interface RTQuestionEnded {
  questionIndex: number;
  correctAnswer: number;
  explanation?: string;
  distribution: Record<number, number>; // option index -> count
  leaderboard: LeaderboardEntry[];
}

export interface RTLeaderboardUpdated {
  leaderboard: LeaderboardEntry[];
}

export interface RTQuizEnded {
  leaderboard: LeaderboardEntry[];
  prizes: Prize[];
}

export interface RTParticipantResult {
  isCorrect: boolean;
  pointsEarned: number;
  totalScore: number;
  rank: number;
  correctAnswer: number;
  explanation?: string;
}

// Client-safe question (no correct answer)
export interface QuestionForClient {
  id: string;
  orderIndex: number;
  type: QuestionType;
  text: string;
  options: string[];
  difficulty: Difficulty;
  points: number;
  timeLimit: number;
}

// =====================
// API Response Types
// =====================

export interface ApiSuccess<T> {
  success: true;
  data: T;
}

export interface ApiError {
  success: false;
  error: string;
  code?: string;
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;
