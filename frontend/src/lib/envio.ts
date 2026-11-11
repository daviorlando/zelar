/**
 * Mensagem para quando o Supabase recusa mandar um email de acesso (convite ou nova senha).
 * São dois limites diferentes, e só o segundo some trocando o servidor de email:
 * - over_request_rate_limit, ou over_email_send_rate_limit com "after N seconds" na mensagem:
 *   o mesmo email pediu há menos de um minuto (o Supabase usa os dois códigos para isso);
 * - over_email_send_rate_limit sem segundos: o projeto esgotou os emails da hora.
 */
export const AGUARDE = "Já enviamos há pouco. Aguarde um minuto para pedir de novo.";
export const LIMITE_DE_EMAILS =
  "O limite de emails por hora foi atingido. Tente de novo mais tarde ou peça um link ao responsável pelo Zelar.";
export const FALHA_NO_ENVIO = "Não foi possível enviar o email agora. Tente de novo em alguns minutos.";

export function erroDeEnvio(error: { status?: number; code?: string; message?: string }): string {
  if (error.code === "over_email_send_rate_limit" && !/after \d+ seconds?/i.test(error.message ?? "")) return LIMITE_DE_EMAILS;
  if (error.code === "over_request_rate_limit" || error.status === 429) return AGUARDE;
  return FALHA_NO_ENVIO;
}
