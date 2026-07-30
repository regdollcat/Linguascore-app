export type User = {
  id: number;
  name: string;
  email: string;
};

export type AuthResponse = {
  token: string;
  user: User;
};

export type AssessmentWord = {
  position: number;
  word: string;
  score: number | null;
};

export type Assessment = {
  id: number;
  createdAt: string;
  finishedAt: string | null;
  totalScore: number | null;
  words: AssessmentWord[];
  nextPosition: number | null;
};

export type ActiveAssessmentResponse = {
  assessment: Assessment | null;
};

export type StartAssessmentResponse = {
  assessmentId: number;
  words: string[];
  totalWords: number;
};

export type GradeWordResponse = {
  position: number;
  word: string;
  score: number;
  nextPosition: number | null;
  pronunciation?: {
    recognizedText: string;
    pronunciationScore100: number;
    accuracyScore: number | null;
    fluencyScore: number | null;
    completenessScore: number | null;
    prosodyScore: number | null;
  };
};

export type FinishAssessmentResponse = {
  assessment: Assessment;
};

export type HistoryItem = {
  id: number;
  createdAt: string;
  finishedAt: string;
  totalScore: number;
  words: Array<{
    position: number;
    word: string;
    score: number;
  }>;
};

export type HistoryResponse = {
  items: HistoryItem[];
};

export type ErrorPayload = {
  error?: string;
  details?: string;
};
