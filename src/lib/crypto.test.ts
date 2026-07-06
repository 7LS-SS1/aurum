import { describe, it, expect } from "vitest";

process.env.DATABASE_URL ??= "postgres://user:pass@localhost:5432/db";
process.env.AUTH_SECRET ??= "a".repeat(32);
process.env.ENCRYPTION_KEY ??= "0".repeat(64);

const { encrypt, decrypt } = await import("./crypto");

describe("encrypt/decrypt", () => {
  it("round-trips plaintext back to the original string", () => {
    const payload = encrypt("hunter2-app-password");
    expect(decrypt(payload)).toBe("hunter2-app-password");
  });

  it("produces a different ciphertext and iv on every call (random nonce)", () => {
    const a = encrypt("same-plaintext");
    const b = encrypt("same-plaintext");
    expect(a.iv).not.toBe(b.iv);
    expect(a.ciphertext).not.toBe(b.ciphertext);
  });

  it("round-trips an empty string", () => {
    const payload = encrypt("");
    expect(decrypt(payload)).toBe("");
  });

  it("throws when the auth tag has been tampered with", () => {
    const payload = encrypt("secret-value");
    const tampered = { ...payload, tag: payload.tag.replace(/^./, payload.tag[0] === "0" ? "1" : "0") };
    expect(() => decrypt(tampered)).toThrow();
  });

  it("throws when the ciphertext has been tampered with", () => {
    const payload = encrypt("secret-value");
    const tampered = { ...payload, ciphertext: Buffer.from("garbage-bytes-here").toString("base64") };
    expect(() => decrypt(tampered)).toThrow();
  });
});
