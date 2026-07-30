import type {
  ActiveAssessmentResponse,
  AuthResponse,
  ErrorPayload,
  FinishAssessmentResponse,
  GradeWordResponse,
  HistoryResponse,
  StartAssessmentResponse,
} from "@/lib/types";

const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

const request = async <T>(
  path: string,
  options?: {
    method?: "GET" | "POST";
    token?: string;
    body?: Record<string, unknown>;
  }
): Promise<T> => {
  const response = await fetch(`${API_URL}${path}`, {
    method: options?.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options?.token ? { Authorization: `Bearer ${options.token}` } : {}),
    },
    body: options?.body ? JSON.stringify(options.body) : undefined,
  });

  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Ошибка запроса", response.status);
  }

  return payload;
};

const parseError = async <T>(response: Response): Promise<T> => {
  const payload = (await response.json().catch(() => ({}))) as T & ErrorPayload;
  if (!response.ok) {
    throw new ApiError(payload.error ?? "Ошибка запроса", response.status);
  }

  return payload;
};

export const api = {
  signup: (input: { name: string; email: string; password: string }) =>
    request<AuthResponse>("/auth/signup", {
      method: "POST",
      body: input,
    }),
  login: (input: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", {
      method: "POST",
      body: input,
    }),
  me: (token: string) => request<{ user: { id: number; name: string; email: string } }>("/auth/me", { token }),
  logout: (token: string) =>
    request<{ success: boolean }>("/auth/logout", {
      method: "POST",
      token,
    }),
  history: (token: string) => request<HistoryResponse>("/assessments/history", { token }),
  activeAssessment: (token: string) =>
    request<ActiveAssessmentResponse>("/assessments/active", { token }),
  startAssessment: (token: string) =>
    request<StartAssessmentResponse>("/assessments/start", {
      method: "POST",
      token,
    }),
  gradeWord: (token: string, assessmentId: number, position: number) =>
    request<GradeWordResponse>(`/assessments/${assessmentId}/grade`, {
      method: "POST",
      token,
      body: { position },
    }),
  gradeWordWithAudio: async (
    token: string,
    assessmentId: number,
    position: number,
    audioUri: string,
    filename = "recording.m4a"
  ) => {
    const formData = new FormData();
    formData.append("position", String(position));
    formData.append(
      "audio",
      {
        uri: audioUri,
        name: filename,
        type: filename.endsWith(".wav") ? "audio/wav" : "audio/mp4",
      } as unknown as Blob
    );

    const response = await fetch(`${API_URL}/assessments/${assessmentId}/grade-audio`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    return parseError<GradeWordResponse>(response);
  },
  finishAssessment: (token: string, assessmentId: number) =>
    request<FinishAssessmentResponse>(`/assessments/${assessmentId}/finish`, {
      method: "POST",
      token,
    }),
};

export { ApiError, API_URL };
