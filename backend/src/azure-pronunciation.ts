import { transcodeToWav16kMono } from "./audio-transcode";

const DEFAULT_LANGUAGE = process.env.AZURE_SPEECH_LANGUAGE ?? "en-US";
const DEFAULT_GRADING_SYSTEM = "HundredMark";
const DEFAULT_GRANULARITY = "Phoneme";
const DEFAULT_DIMENSION = "Comprehensive";

export class AzurePronunciationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzurePronunciationConfigError";
  }
}

export class AzurePronunciationServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AzurePronunciationServiceError";
  }
}

export type PronunciationResult = {
  recognizedText: string;
  pronunciationScore100: number;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  prosodyScore: number | null;
  score100: number;
  rawResponse: unknown;
};

const getSpeechKey = (): string => {
  const key = process.env.AZURE_SPEECH_KEY?.trim();
  if (!key) {
    throw new AzurePronunciationConfigError(
      "AZURE_SPEECH_KEY не задан. Добавьте ключ Speech resource в backend/.env"
    );
  }

  return key;
};

const getSpeechRegion = (): string => {
  const region = process.env.AZURE_SPEECH_REGION?.trim();
  if (!region) {
    throw new AzurePronunciationConfigError(
      "AZURE_SPEECH_REGION не задан. Например: germanywestcentral"
    );
  }

  return region;
};

const getSpeechEndpointBase = (): string => {
  const customEndpoint = process.env.AZURE_SPEECH_ENDPOINT?.trim();
  if (customEndpoint) {
    return customEndpoint.replace(/\/$/, "");
  }

  return `https://${getSpeechRegion()}.stt.speech.microsoft.com`;
};

const clampScore100 = (value: number): number => Math.max(0, Math.min(100, Math.round(value)));

const parseNumberOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export const isAzurePronunciationConfigured = (): boolean =>
  Boolean(process.env.AZURE_SPEECH_KEY?.trim() && process.env.AZURE_SPEECH_REGION?.trim());

export const assessPronunciation = async (input: {
  audioBytes: Uint8Array;
  audioFilename?: string | null;
  audioMimeType?: string | null;
  referenceText: string;
  language?: string;
}): Promise<PronunciationResult> => {
  const key = getSpeechKey();
  const endpointBase = getSpeechEndpointBase();
  const language = input.language ?? DEFAULT_LANGUAGE;

  const wavAudio = await transcodeToWav16kMono({
    bytes: input.audioBytes,
    filename: input.audioFilename,
    mimeType: input.audioMimeType,
  });

  const pronunciationConfig = {
    ReferenceText: input.referenceText,
    GradingSystem: DEFAULT_GRADING_SYSTEM,
    Dimension: DEFAULT_DIMENSION,
    Granularity: DEFAULT_GRANULARITY,
    EnableMiscue: false,
    EnableProsodyAssessment: "True",
  };

  const pronunciationHeader = Buffer.from(JSON.stringify(pronunciationConfig), "utf8").toString(
    "base64"
  );

  const url = `${endpointBase}/speech/recognition/conversation/cognitiveservices/v1?language=${encodeURIComponent(language)}&format=detailed`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Pronunciation-Assessment": pronunciationHeader,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: Buffer.from(wavAudio),
  });

  const rawText = await response.text();
  let payload: unknown = rawText;

  try {
    payload = JSON.parse(rawText);
  } catch {
    // Azure may return plain text in error scenarios.
  }

  if (!response.ok) {
    throw new AzurePronunciationServiceError(
      `Azure Speech вернул ${response.status}: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  const typedPayload = payload as {
    RecognitionStatus?: string;
    NBest?: Array<{
      Display?: string;
      Lexical?: string;
      AccuracyScore?: number;
      FluencyScore?: number;
      CompletenessScore?: number;
      ProsodyScore?: number;
      PronScore?: number;
      PronunciationAssessment?: {
        AccuracyScore?: number;
        FluencyScore?: number;
        CompletenessScore?: number;
        ProsodyScore?: number;
        PronScore?: number;
      };
    }>;
    DisplayText?: string;
  };

  if (typedPayload.RecognitionStatus && typedPayload.RecognitionStatus !== "Success") {
    throw new AzurePronunciationServiceError(
      `Azure Speech не распознал речь: ${typedPayload.RecognitionStatus}`
    );
  }

  const bestResult = typedPayload.NBest?.[0];
  const pronunciation = bestResult?.PronunciationAssessment;
  const pronScore100 = parseNumberOrNull(bestResult?.PronScore) ?? parseNumberOrNull(pronunciation?.PronScore);

  if (pronScore100 === null) {
    throw new AzurePronunciationServiceError(
      `Azure Speech не вернул PronScore: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`
    );
  }

  return {
    recognizedText: bestResult?.Display ?? bestResult?.Lexical ?? typedPayload.DisplayText ?? "",
    pronunciationScore100: pronScore100,
    accuracyScore:
      parseNumberOrNull(bestResult?.AccuracyScore) ?? parseNumberOrNull(pronunciation?.AccuracyScore),
    fluencyScore:
      parseNumberOrNull(bestResult?.FluencyScore) ?? parseNumberOrNull(pronunciation?.FluencyScore),
    completenessScore:
      parseNumberOrNull(bestResult?.CompletenessScore) ??
      parseNumberOrNull(pronunciation?.CompletenessScore),
    prosodyScore:
      parseNumberOrNull(bestResult?.ProsodyScore) ?? parseNumberOrNull(pronunciation?.ProsodyScore),
    score100: clampScore100(pronScore100),
    rawResponse: payload,
  };
};
