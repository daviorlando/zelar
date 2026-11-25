/**
 * Chave do limite de tentativas por IP. IPv6 vale pelo prefixo /64: um provedor entrega o
 * bloco inteiro a um cliente, e contar endereço por endereço deixaria trocar de IP a cada pedido.
 * IPv4 (inclusive o mapeado em IPv6, ::ffff:1.2.3.4) vale pelo endereço.
 */
export function chaveDoIp(ip: string): string {
  const limpo = ip.trim().toLowerCase().replace(/^\[|\]$/g, "").split("%")[0];
  if (!limpo.includes(":")) return limpo;
  const ultimo = limpo.slice(limpo.lastIndexOf(":") + 1);
  if (ultimo.includes(".")) return ultimo;

  const [cabeca, cauda] = limpo.split("::");
  const inicio = cabeca ? cabeca.split(":") : [];
  const fim = cauda ? cauda.split(":") : [];
  const grupos = cauda === undefined ? inicio : [...inicio, ...Array(Math.max(0, 8 - inicio.length - fim.length)).fill("0"), ...fim];
  if (grupos.length !== 8 || !grupos.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return limpo;
  return `${grupos.slice(0, 4).map((g) => parseInt(g, 16).toString(16)).join(":")}::/64`;
}
