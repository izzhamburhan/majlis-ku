import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const settings = vi.hoisted(() => ({ EMAIL_SERVER: undefined as string | undefined, EMAIL_FROM: "Majlis Ku <no-reply@majlisku.test>" }));
vi.mock("@/lib/env", () => ({ env: () => settings }));
const fsMock = vi.hoisted(() => ({ appendFile: vi.fn(async () => undefined), mkdir: vi.fn(async () => undefined) }));
vi.mock("node:fs/promises", () => fsMock);
const smtp = vi.hoisted(() => ({ sendMail: vi.fn(async () => ({})) }));
vi.mock("nodemailer", () => ({ createTransport: () => smtp }));

const { sendVerificationRequest } = await import("@/server/auth/email");

const LINK = "https://majlisku.example.com/api/auth/callback/email?token=abc123&email=host%40example.com";

beforeEach(() => {
  settings.EMAIL_SERVER = undefined;
  fsMock.appendFile.mockClear();
  fsMock.mkdir.mockClear();
  smtp.sendMail.mockClear();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("sendVerificationRequest", () => {
  it("magic link is not logged or written to a file when deployed", async () => {
    vi.stubEnv("DEPLOYED", "1");
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(sendVerificationRequest({ identifier: "host@example.com", url: LINK })).rejects.toThrow();

    expect(fsMock.appendFile).not.toHaveBeenCalled();
    expect(fsMock.mkdir).not.toHaveBeenCalled();
    expect(smtp.sendMail).not.toHaveBeenCalled();
    for (const spy of [log, info, warn, error]) expect(JSON.stringify(spy.mock.calls)).not.toContain("abc123");
  });

  it("still writes the link to the log and the dev mail file locally, as e2e expects", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await sendVerificationRequest({ identifier: "host@example.com", url: LINK });
    expect(JSON.stringify(log.mock.calls)).toContain("abc123");
    expect(fsMock.appendFile).toHaveBeenCalledTimes(1);
  });

  it("sends real email when deployed with a mail server, without logging the link", async () => {
    vi.stubEnv("DEPLOYED", "1");
    settings.EMAIL_SERVER = "smtp://user:pass@mail.example.com:587";
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await sendVerificationRequest({ identifier: "host@example.com", url: LINK });
    expect(smtp.sendMail).toHaveBeenCalledTimes(1);
    expect(fsMock.appendFile).not.toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain("abc123");
  });
});