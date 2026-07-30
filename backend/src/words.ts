const WORD_POOL = [
  "language",
  "learning",
  "pronunciation",
  "rhythm",
  "clarity",
  "future",
  "curious",
  "bright",
  "travel",
  "culture",
  "science",
  "planet",
  "energy",
  "window",
  "mountain",
  "library",
  "computer",
  "keyboard",
  "project",
  "quality",
  "friendly",
  "freedom",
  "victory",
  "journey",
  "artist",
  "healthy",
  "balance",
  "progress",
  "chocolate",
  "camera",
  "picture",
  "morning",
  "evening",
  "weather",
  "airport",
  "puzzle",
  "bridge",
  "garden",
  "lesson",
  "accent",
  "speaker",
  "memory",
  "concept",
  "honest",
  "signal",
  "design",
  "forest",
  "island",
  "comfort",
  "focus"
] as const;

const WORDS_PER_ASSESSMENT = 10;

export const getRandomWords = (): string[] => {
  const shuffled = [...WORD_POOL];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[randomIndex];
    shuffled[randomIndex] = current;
  }

  return shuffled.slice(0, WORDS_PER_ASSESSMENT);
};

export const getRandomScore = (): number => Math.floor(Math.random() * 101);

export const assessmentLength = WORDS_PER_ASSESSMENT;
