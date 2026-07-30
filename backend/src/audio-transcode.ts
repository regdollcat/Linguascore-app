import ffmpegStatic from "ffmpeg-static";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";

const fallbackFfmpegPath = "ffmpeg";

const extensionByMimeType: Record<string, string> = {
  "audio/mp4": ".m4a",
  "audio/m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/x-caf": ".caf",
  "audio/wav": ".wav",
  "audio/wave": ".wav",
  "audio/x-wav": ".wav",
  "audio/webm": ".webm",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus",
};

const getFileExtension = (filename?: string | null, mimeType?: string | null): string => {
  const safeMimeType = mimeType?.split(";")[0]?.trim().toLowerCase();
  if (safeMimeType && extensionByMimeType[safeMimeType]) {
    return extensionByMimeType[safeMimeType];
  }

  const candidateExtension = filename ? extname(filename).toLowerCase() : "";
  if (candidateExtension) {
    return candidateExtension;
  }

  return ".bin";
};

const readStream = async (stream: ReadableStream<Uint8Array> | null): Promise<string> => {
  if (!stream) {
    return "";
  }

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];

  while (true) {
    const chunk = await reader.read();
    if (chunk.done) {
      break;
    }

    chunks.push(chunk.value);
  }

  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
};

export const transcodeToWav16kMono = async (input: {
  bytes: Uint8Array;
  filename?: string | null;
  mimeType?: string | null;
}): Promise<Uint8Array> => {
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || fallbackFfmpegPath;
  const tempDirectory = await mkdtemp(join(tmpdir(), "linguascore-audio-"));

  const inputPath = join(tempDirectory, `input${getFileExtension(input.filename, input.mimeType)}`);
  const outputPath = join(tempDirectory, "output.wav");

  try {
    await writeFile(inputPath, input.bytes);

    const process = Bun.spawn(
      [
        ffmpegPath,
        "-y",
        "-i",
        inputPath,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-f",
        "wav",
        outputPath,
      ],
      {
        stdout: "pipe",
        stderr: "pipe",
      }
    );

    const [exitCode, stderr] = await Promise.all([process.exited, readStream(process.stderr)]);
    if (exitCode !== 0) {
      throw new Error(`ffmpeg failed with code ${exitCode}: ${stderr}`);
    }

    const wavFile = await readFile(outputPath);
    return new Uint8Array(wavFile.buffer.slice(wavFile.byteOffset, wavFile.byteOffset + wavFile.byteLength));
  } finally {
    await rm(tempDirectory, { recursive: true, force: true });
  }
};
