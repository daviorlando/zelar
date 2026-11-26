import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

describe("cifra", () => {
  beforeAll(() => {
    process.env.SUPABASE_SECRET_KEY = "chave-de-teste";
  });

  it("decifra o que cifrou, e cada cifra sai diferente", async () => {
    const { cifrar, decifrar } = await import("./cifra");
    const a = cifrar("ABCD2345");
    expect(a).not.toBe(cifrar("ABCD2345"));
    expect(decifrar(a)).toBe("ABCD2345");
  });

  it("devolve null com outra chave ou texto adulterado", async () => {
    const { cifrar, decifrar } = await import("./cifra");
    const a = cifrar("ABCD2345");
    const b = Buffer.from(a, "base64");
    b[b.length - 1] ^= 1;
    expect(decifrar(b.toString("base64"))).toBeNull();
    process.env.SUPABASE_SECRET_KEY = "outra-chave";
    expect(decifrar(a)).toBeNull();
    process.env.SUPABASE_SECRET_KEY = "chave-de-teste";
  });
});
