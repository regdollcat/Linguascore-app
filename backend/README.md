# LinguaScore Backend

Type-safe backend на **Bun + Elysia + SQLite** для мобильного приложения оценки произношения.

## Стек
- Bun
- Elysia (TypeScript)
- SQLite (`bun:sqlite`)
- Сессии через bearer token

## Запуск
```bash
bun install
cp .env.example .env
bun run dev
```

Сервер поднимается на `http://localhost:3000` (или на `PORT`, если задан).

## Env (Azure Pronunciation Assessment)
- `AZURE_SPEECH_KEY` — ключ Speech resource (или совместимого Azure AI Services resource с доступом к Speech)
- `AZURE_SPEECH_REGION` — регион ресурса (например `germanywestcentral`)
- `AZURE_SPEECH_LANGUAGE` — язык оценивания (для текущего набора слов нужен `en-US`)

Важно: endpoint вида `https://...services.ai.azure.com/api/projects/...` (Azure AI Foundry project endpoint) в этой интеграции не используется. Pronunciation Assessment REST вызывается через Speech STT endpoint региона.

## Скрипты
- `bun run dev` — запуск с watch
- `bun run start` — обычный запуск
- `bun run typecheck` — проверка TypeScript

## Основные endpoint'ы
- `POST /auth/signup`
- `POST /auth/login`
- `GET /auth/me`
- `POST /auth/logout`
- `POST /assessments/start`
- `GET /assessments/active`
- `POST /assessments/:assessmentId/grade`
- `POST /assessments/:assessmentId/grade-audio` (реальная оценка через Azure, `multipart/form-data`)
- `POST /assessments/:assessmentId/finish`
- `GET /assessments/history`

SQLite-файл создаётся автоматически в `backend/data/linguascore.sqlite`.
