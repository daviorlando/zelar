import { describe, expect, it } from "vitest";
import { AGUARDE, erroDeEnvio, FALHA_NO_ENVIO, LIMITE_DE_EMAILS } from "./envio";

describe("erroDeEnvio", () => {
  it("separa o limite de emails do projeto do pedido repetido", () => {
    expect(erroDeEnvio({ status: 429, code: "over_email_send_rate_limit" })).toBe(LIMITE_DE_EMAILS);
    expect(erroDeEnvio({ status: 429, code: "over_request_rate_limit" })).toBe(AGUARDE);
    // Pedido repetido do mesmo email: o Supabase manda o código do limite por hora, mas com os segundos que faltam.
    expect(
      erroDeEnvio({
        status: 429,
        code: "over_email_send_rate_limit",
        message: "For security purposes, you can only request this after 54 seconds.",
      }),
    ).toBe(AGUARDE);
  });

  it("trata qualquer outro 429 como pedido repetido", () => {
    expect(erroDeEnvio({ status: 429 })).toBe(AGUARDE);
  });

  it("não mostra a mensagem crua do servidor", () => {
    expect(erroDeEnvio({ status: 500, code: "unexpected_failure" })).toBe(FALHA_NO_ENVIO);
  });
});
