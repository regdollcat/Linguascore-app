export type UserRow = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  created_at: string;
};

export type SessionRow = {
  token: string;
  user_id: number;
  created_at: string;
  expires_at: string;
};

export type AssessmentRow = {
  id: number;
  user_id: number;
  created_at: string;
  finished_at: string | null;
  total_score: number | null;
};

export type AssessmentItemRow = {
  id: number;
  assessment_id: number;
  position: number;
  word: string;
  score: number | null;
};

export type AuthUser = {
  id: number;
  name: string;
  email: string;
  token: string;
};
