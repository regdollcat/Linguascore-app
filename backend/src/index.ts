import { Elysia, t } from "elysia";

import {
  createSession,
  createUser,
  findUserByEmail,
  getAuthUserByToken,
  normalizeEmail,
  removeSession,
} from "./auth";
import {
  AzurePronunciationConfigError,
  AzurePronunciationServiceError,
  assessPronunciation,
  isAzurePronunciationConfigured,
} from "./azure-pronunciation";
import { db } from "./db";
import type { AssessmentItemRow, AssessmentRow, AuthUser } from "./types";
import { assessmentLength, getRandomScore, getRandomWords } from "./words";

const insertAssessmentStatement = db.prepare(
  "INSERT INTO assessments (user_id, created_at) VALUES (?, ?)"
);
const insertAssessmentItemStatement = db.prepare(
  "INSERT INTO assessment_items (assessment_id, position, word, score) VALUES (?, ?, ?, NULL)"
);
const selectAssessmentStatement = db.query(
  "SELECT id, user_id, created_at, finished_at, total_score FROM assessments WHERE id = ? AND user_id = ? LIMIT 1"
);
const selectItemsByAssessmentStatement = db.query(
  "SELECT id, assessment_id, position, word, score FROM assessment_items WHERE assessment_id = ? ORDER BY position ASC"
);
const selectNextUnscoredItemStatement = db.query(
  "SELECT id, assessment_id, position, word, score FROM assessment_items WHERE assessment_id = ? AND score IS NULL ORDER BY position ASC LIMIT 1"
);
const selectAssessmentItemByPositionStatement = db.query(
  "SELECT id, assessment_id, position, word, score FROM assessment_items WHERE assessment_id = ? AND position = ? LIMIT 1"
);
const updateAssessmentItemScoreStatement = db.prepare(
  "UPDATE assessment_items SET score = ? WHERE id = ?"
);
const updateAssessmentSummaryStatement = db.prepare(
  "UPDATE assessments SET total_score = ?, finished_at = ? WHERE id = ?"
);
const selectHistoryRowsStatement = db.query(`
  SELECT
    a.id AS assessment_id,
    a.created_at,
    a.finished_at,
    a.total_score,
    ai.position,
    ai.word,
    ai.score
  FROM assessments a
  INNER JOIN assessment_items ai ON ai.assessment_id = a.id
  WHERE a.user_id = ? AND a.finished_at IS NOT NULL
  ORDER BY a.finished_at DESC, ai.position ASC
`);
const selectActiveAssessmentStatement = db.query(
  "SELECT id, user_id, created_at, finished_at, total_score FROM assessments WHERE user_id = ? AND finished_at IS NULL ORDER BY created_at DESC LIMIT 1"
);

const createAssessmentWithItems = db.transaction((userId: number, words: string[]) => {
  const createdAt = new Date().toISOString();
  const assessmentResult = insertAssessmentStatement.run(userId, createdAt);
  const assessmentId = Number(assessmentResult.lastInsertRowid);

  words.forEach((word, position) => {
    insertAssessmentItemStatement.run(assessmentId, position, word);
  });

  return assessmentId;
});

const parseBearerToken = (authorizationHeader?: string): string | null => {
  if (!authorizationHeader) {
    return null;
  }

  const [scheme, token] = authorizationHeader.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim();
};

const authorize = (headers: Record<string, string | undefined>): AuthUser | null => {
  const token = parseBearerToken(headers.authorization);
  if (!token) {
    return null;
  }

  return getAuthUserByToken(token);
};

const mapAssessmentItems = (rows: AssessmentItemRow[]) =>
  rows.map((row) => ({
    position: row.position,
    word: row.word,
    score: row.score,
  }));

const mapAssessmentResponse = (assessment: AssessmentRow, items: AssessmentItemRow[]) => ({
  id: assessment.id,
  createdAt: assessment.created_at,
  finishedAt: assessment.finished_at,
  totalScore: assessment.total_score,
  words: mapAssessmentItems(items),
  nextPosition: items.find((item) => item.score === null)?.position ?? null,
});

const validateGradableItem = (input: {
  user: AuthUser;
  assessmentId: number;
  position: number;
  set: { status?: number | string };
}): { assessment: AssessmentRow; item: AssessmentItemRow } | null => {
  const assessment = selectAssessmentStatement.get(
    input.assessmentId,
    input.user.id
  ) as AssessmentRow | null;

  if (!assessment) {
    input.set.status = 404;
    return null;
  }

  if (assessment.finished_at) {
    input.set.status = 409;
    return null;
  }

  const nextItem = selectNextUnscoredItemStatement.get(input.assessmentId) as AssessmentItemRow | null;
  if (!nextItem) {
    input.set.status = 409;
    return null;
  }

  if (nextItem.position !== input.position) {
    input.set.status = 422;
    return null;
  }

  const item = selectAssessmentItemByPositionStatement.get(
    input.assessmentId,
    input.position
  ) as AssessmentItemRow | null;

  if (!item) {
    input.set.status = 404;
    return null;
  }

  return { assessment, item };
};

const buildGradeResponse = (item: AssessmentItemRow, score: number) => ({
  position: item.position,
  word: item.word,
  score,
  nextPosition: item.position + 1 < assessmentLength ? item.position + 1 : null,
});

const app = new Elysia()
  .onRequest(({ set }) => {
    set.headers["access-control-allow-origin"] = "*";
    set.headers["access-control-allow-methods"] = "GET,POST,OPTIONS";
    set.headers["access-control-allow-headers"] = "Content-Type, Authorization";
  })
  .options("/*", ({ set }) => {
    set.status = 204;
    return "";
  })
  .get("/", () => ({
    service: "LinguaScore API",
    status: "ok",
    now: new Date().toISOString(),
  }))
  .post(
    "/auth/signup",
    async ({ body, set }) => {
      const trimmedName = body.name.trim();
      if (!trimmedName) {
        set.status = 400;
        return { error: "Имя не может быть пустым" };
      }

      const normalizedEmail = normalizeEmail(body.email);
      const existingUser = findUserByEmail(normalizedEmail);

      if (existingUser) {
        set.status = 409;
        return { error: "Пользователь с таким email уже существует" };
      }

      const passwordHash = await Bun.password.hash(body.password);
      const userId = createUser({
        name: trimmedName,
        email: normalizedEmail,
        passwordHash,
      });

      const token = createSession(userId);

      return {
        token,
        user: {
          id: userId,
          name: trimmedName,
          email: normalizedEmail,
        },
      };
    },
    {
      body: t.Object({
        name: t.String({ minLength: 2, maxLength: 60 }),
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6, maxLength: 120 }),
      }),
    }
  )
  .post(
    "/auth/login",
    async ({ body, set }) => {
      const normalizedEmail = normalizeEmail(body.email);
      const user = findUserByEmail(normalizedEmail);

      if (!user) {
        set.status = 401;
        return { error: "Неверный email или пароль" };
      }

      const isPasswordValid = await Bun.password.verify(body.password, user.password_hash);
      if (!isPasswordValid) {
        set.status = 401;
        return { error: "Неверный email или пароль" };
      }

      const token = createSession(user.id);

      return {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
        },
      };
    },
    {
      body: t.Object({
        email: t.String({ format: "email" }),
        password: t.String({ minLength: 6, maxLength: 120 }),
      }),
    }
  )
  .get("/auth/me", ({ headers, set }) => {
    const user = authorize(headers);

    if (!user) {
      set.status = 401;
      return { error: "Требуется авторизация" };
    }

    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    };
  })
  .post("/auth/logout", ({ headers, set }) => {
    const token = parseBearerToken(headers.authorization);

    if (!token) {
      set.status = 401;
      return { error: "Требуется авторизация" };
    }

    removeSession(token);

    return { success: true };
  })
  .post("/assessments/start", ({ headers, set }) => {
    const user = authorize(headers);

    if (!user) {
      set.status = 401;
      return { error: "Требуется авторизация" };
    }

    const words = getRandomWords();
    const assessmentId = createAssessmentWithItems(user.id, words);

    return {
      assessmentId,
      words,
      totalWords: assessmentLength,
    };
  })
  .get("/assessments/active", ({ headers, set }) => {
    const user = authorize(headers);

    if (!user) {
      set.status = 401;
      return { error: "Требуется авторизация" };
    }

    const assessment = selectActiveAssessmentStatement.get(user.id) as AssessmentRow | null;
    if (!assessment) {
      return { assessment: null };
    }

    const items = selectItemsByAssessmentStatement.all(assessment.id) as AssessmentItemRow[];

    return {
      assessment: mapAssessmentResponse(assessment, items),
    };
  })
  .post(
    "/assessments/:assessmentId/grade",
    ({ headers, params, body, set }) => {
      const user = authorize(headers);

      if (!user) {
        set.status = 401;
        return { error: "Требуется авторизация" };
      }

      const assessmentId = Number(params.assessmentId);
      const validation = validateGradableItem({
        user,
        assessmentId,
        position: body.position,
        set,
      });
      if (!validation) {
        if (set.status === 422) {
          const expected = selectNextUnscoredItemStatement.get(assessmentId) as AssessmentItemRow | null;
          return {
            error: "Слова нужно проходить по порядку",
            expectedPosition: expected?.position ?? null,
          };
        }

        if (set.status === 404) {
          return { error: "Оценка или слово не найдены" };
        }

        return { error: "Невозможно оценить слово в текущем состоянии" };
      }

      const { item } = validation;

      const score = getRandomScore();
      updateAssessmentItemScoreStatement.run(score, item.id);

      return buildGradeResponse(item, score);
    },
    {
      params: t.Object({
        assessmentId: t.Numeric({ minimum: 1 }),
      }),
      body: t.Object({
        position: t.Integer({ minimum: 0, maximum: assessmentLength - 1 }),
      }),
    }
  )
  .post(
    "/assessments/:assessmentId/grade-audio",
    async ({ headers, params, request, set }) => {
      const user = authorize(headers);

      if (!user) {
        set.status = 401;
        return { error: "Требуется авторизация" };
      }

      const formData = await request.formData();
      const positionRaw = formData.get("position");
      const audioFile = formData.get("audio");

      const position =
        typeof positionRaw === "string" ? Number.parseInt(positionRaw, 10) : Number.NaN;

      if (!Number.isInteger(position) || position < 0 || position >= assessmentLength) {
        set.status = 400;
        return { error: "Некорректная позиция слова" };
      }

      if (!(audioFile instanceof File)) {
        set.status = 400;
        return { error: "Файл audio обязателен" };
      }

      if (audioFile.size === 0) {
        set.status = 400;
        return { error: "Аудиофайл пустой" };
      }

      const assessmentId = Number(params.assessmentId);
      const validation = validateGradableItem({
        user,
        assessmentId,
        position,
        set,
      });

      if (!validation) {
        if (set.status === 422) {
          const expected = selectNextUnscoredItemStatement.get(assessmentId) as AssessmentItemRow | null;
          return {
            error: "Слова нужно проходить по порядку",
            expectedPosition: expected?.position ?? null,
          };
        }

        if (set.status === 404) {
          return { error: "Оценка или слово не найдены" };
        }

        return { error: "Невозможно оценить слово в текущем состоянии" };
      }

      if (!isAzurePronunciationConfigured()) {
        set.status = 500;
        return {
          error:
            "Azure Pronunciation Assessment не настроен. Добавьте AZURE_SPEECH_KEY и AZURE_SPEECH_REGION в backend/.env",
        };
      }

      const { item } = validation;
      const audioBuffer = new Uint8Array(await audioFile.arrayBuffer());

      try {
        const azureResult = await assessPronunciation({
          audioBytes: audioBuffer,
          audioFilename: audioFile.name,
          audioMimeType: audioFile.type,
          referenceText: item.word,
          language: process.env.AZURE_SPEECH_LANGUAGE ?? "en-US",
        });

        updateAssessmentItemScoreStatement.run(azureResult.score100, item.id);

        return {
          ...buildGradeResponse(item, azureResult.score100),
          pronunciation: {
            recognizedText: azureResult.recognizedText,
            pronunciationScore100: azureResult.pronunciationScore100,
            accuracyScore: azureResult.accuracyScore,
            fluencyScore: azureResult.fluencyScore,
            completenessScore: azureResult.completenessScore,
            prosodyScore: azureResult.prosodyScore,
          },
        };
      } catch (error) {
        if (error instanceof AzurePronunciationConfigError) {
          set.status = 500;
          return { error: error.message };
        }

        if (error instanceof AzurePronunciationServiceError) {
          set.status = 502;
          return { error: error.message };
        }

        throw error;
      }
    },
    {
      params: t.Object({
        assessmentId: t.Numeric({ minimum: 1 }),
      }),
    }
  )
  .post(
    "/assessments/:assessmentId/finish",
    ({ headers, params, set }) => {
      const user = authorize(headers);

      if (!user) {
        set.status = 401;
        return { error: "Требуется авторизация" };
      }

      const assessmentId = Number(params.assessmentId);
      const assessment = selectAssessmentStatement.get(assessmentId, user.id) as AssessmentRow | null;

      if (!assessment) {
        set.status = 404;
        return { error: "Оценка не найдена" };
      }

      const items = selectItemsByAssessmentStatement.all(assessmentId) as AssessmentItemRow[];
      if (items.length !== assessmentLength) {
        set.status = 500;
        return { error: "Данные оценки повреждены" };
      }

      const hasMissingScores = items.some((item) => item.score === null);
      if (hasMissingScores) {
        set.status = 422;
        return { error: "Сначала оцените все слова" };
      }

      if (!assessment.finished_at || assessment.total_score === null) {
        const sum = items.reduce((acc, item) => acc + (item.score ?? 0), 0);
        const totalScore = Math.max(0, Math.min(100, Math.round(sum / items.length)));
        const finishedAt = new Date().toISOString();

        updateAssessmentSummaryStatement.run(totalScore, finishedAt, assessmentId);

        assessment.finished_at = finishedAt;
        assessment.total_score = totalScore;
      }

      return {
        assessment: mapAssessmentResponse(assessment, items),
      };
    },
    {
      params: t.Object({
        assessmentId: t.Numeric({ minimum: 1 }),
      }),
    }
  )
  .get("/assessments/history", ({ headers, set }) => {
    const user = authorize(headers);

    if (!user) {
      set.status = 401;
      return { error: "Требуется авторизация" };
    }

    const rows = selectHistoryRowsStatement.all(user.id) as Array<{
      assessment_id: number;
      created_at: string;
      finished_at: string;
      total_score: number;
      position: number;
      word: string;
      score: number;
    }>;

    const byAssessment = new Map<
      number,
      {
        id: number;
        createdAt: string;
        finishedAt: string;
        totalScore: number;
        words: Array<{ position: number; word: string; score: number }>;
      }
    >();

    rows.forEach((row) => {
      const existing = byAssessment.get(row.assessment_id);
      if (existing) {
        existing.words.push({
          position: row.position,
          word: row.word,
          score: row.score,
        });
        return;
      }

      byAssessment.set(row.assessment_id, {
        id: row.assessment_id,
        createdAt: row.created_at,
        finishedAt: row.finished_at,
        totalScore: row.total_score,
        words: [
          {
            position: row.position,
            word: row.word,
            score: row.score,
          },
        ],
      });
    });

    return {
      items: Array.from(byAssessment.values()),
    };
  })
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: "Некорректные входные данные",
        details: error.message,
      };
    }

    set.status = 500;
    return { error: "Внутренняя ошибка сервера" };
  });

const port = Number(process.env.PORT ?? 3000);

app.listen(port);

console.log(`LinguaScore backend запущен на http://localhost:${port}`);
