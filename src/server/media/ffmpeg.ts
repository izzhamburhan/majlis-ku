import { spawn } from "node:child_process";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const TIMEOUT_MS = 5 * 60 * 1000;

// One thread for decoding (before -i) and for encoding (before the output file), and one for filters: the free
// hosting tier has a fraction of a CPU, and a video job must not starve the web server running next to it.
const ONE_THREAD = ["-threads", "1"];

function binary(): string {
  if (!ffmpegPath) throw new Error("ffmpeg-static has no binary for this platform");
  return ffmpegPath;
}

/** Run ffmpeg; resolves with stderr (where ffmpeg prints its info), rejects on a non-zero exit. */
function ffmpeg(args: string[], { allowFailure = false } = {}): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(binary(), ["-hide_banner", "-nostdin", "-filter_threads", "1", ...args], { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
    });
    const timer = setTimeout(() => child.kill("SIGKILL"), TIMEOUT_MS);
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 || allowFailure) resolve(stderr);
      else reject(new Error(`ffmpeg exited with ${code}: ${stderr.slice(-500)}`));
    });
  });
}

export function parseDuration(text: string): number | null {
  const match = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(text);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

/** Length in seconds, or null if ffmpeg cannot read the file as media. */
export async function probeDuration(input: string): Promise<number | null> {
  // With no output file ffmpeg exits non-zero, but prints the input's details first.
  const info = await ffmpeg([...ONE_THREAD, "-i", input], { allowFailure: true });
  return parseDuration(info);
}

export type VideoCopies = { video: string; poster: string; durationSec: number };

/** H.264/AAC MP4 (at most 1280 px wide, fast start) plus a poster frame. */
export async function makeVideoCopies(input: string, outDir: string, { maxSeconds }: { maxSeconds: number }): Promise<VideoCopies> {
  const durationSec = await probeDuration(input);
  if (durationSec === null) throw new Error("Not a readable video");
  const video = join(outDir, "display.mp4");
  const poster = join(outDir, "poster.jpg");
  await ffmpeg([
    "-y",
    ...ONE_THREAD,
    "-i",
    input,
    "-t",
    String(maxSeconds + 1),
    "-vf",
    "scale='min(1280,iw)':-2",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "26",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-movflags",
    "+faststart",
    ...ONE_THREAD,
    video,
  ]);
  const at = durationSec > 1.5 ? "1" : "0";
  await ffmpeg(["-y", "-ss", at, ...ONE_THREAD, "-i", video, "-frames:v", "1", "-vf", "scale='min(800,iw)':-2", "-q:v", "4", ...ONE_THREAD, poster]);
  return { video, poster, durationSec };
}

export type VoiceCopy = { audio: string; durationSec: number };

/** AAC in an .m4a container: plays on every phone browser, including older iPhones. */
export async function makeVoiceCopy(input: string, outDir: string): Promise<VoiceCopy> {
  const audio = join(outDir, "display.m4a");
  await ffmpeg(["-y", ...ONE_THREAD, "-i", input, "-vn", "-c:a", "aac", "-b:a", "96k", "-movflags", "+faststart", ...ONE_THREAD, audio]);
  const durationSec = (await probeDuration(audio)) ?? (await probeDuration(input));
  if (durationSec === null) throw new Error("Not a readable audio file");
  return { audio, durationSec };
}