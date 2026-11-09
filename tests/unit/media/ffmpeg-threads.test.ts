import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));
vi.mock("ffmpeg-static", () => ({ default: "/fake/ffmpeg" }));

const { makeVideoCopies, makeVoiceCopy } = await import("@/server/media/ffmpeg");

beforeEach(() => {
  spawn.mockReset();
  spawn.mockImplementation(() => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter };
    child.stderr = new EventEmitter();
    setImmediate(() => {
      child.stderr.emit("data", Buffer.from("Duration: 00:00:02.00, start: 0"));
      child.emit("close", 0);
    });
    return child;
  });
});

const calls = () => spawn.mock.calls.map((call) => call[1] as string[]);

function expectOneThread(args: string[]) {
  const input = args.indexOf("-i");
  expect(args.slice(input - 2, input), args.join(" ")).toEqual(["-threads", "1"]);
}

describe("ffmpeg runs with one thread", () => {
  it("for decoding and encoding in every video step", async () => {
    await makeVideoCopies("in.mp4", "out", { maxSeconds: 60 });
    expect(calls().length).toBeGreaterThanOrEqual(3);
    for (const args of calls()) {
      expectOneThread(args);
      expect(args).toContain("-filter_threads");
    }
    const encode = calls().find((args) => args.includes("libx264"))!;
    expect(encode.slice(-3, -1)).toEqual(["-threads", "1"]);
  });

  it("for the voice copy", async () => {
    await makeVoiceCopy("in.webm", "out");
    for (const args of calls()) expectOneThread(args);
    const encode = calls().find((args) => args.includes("aac"))!;
    expect(encode.slice(-3, -1)).toEqual(["-threads", "1"]);
  });
});
