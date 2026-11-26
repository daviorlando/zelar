import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/*
 * Cifra curta para guardar no banco algo que o painel precisa mostrar de novo (o código de um
 * celular). AES-256-GCM com chave derivada da chave secreta do Supabase, que só o servidor tem:
 * quem ler o banco sem ela não lê o código.
 */
function chave() {
  const segredo = process.env.SUPABASE_SECRET_KEY;
  if (!segredo) throw new Error("Variável SUPABASE_SECRET_KEY ausente (veja frontend/.env.example).");
  return createHash("sha256").update(`zelar:cifra:${segredo}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", chave(), iv);
  const dados = Buffer.concat([c.update(texto, "utf8"), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), dados]).toString("base64");
}

/** Null se o texto foi cifrado com outra chave ou está corrompido. */
export function decifrar(cifrado: string): string | null {
  try {
    const b = Buffer.from(cifrado, "base64");
    const d = createDecipheriv("aes-256-gcm", chave(), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
