import "server-only";
import { createHash, randomBytes } from "node:crypto";

export type Worker = {
  id: string;
  name: string;
  photo_path: string | null;
  pin: number[];
  badge_token: string;
  badge_version: number;
  active: boolean;
};

export const PHOTO_BUCKET = "worker-photos";

/** Código do crachá: aleatório, sem dados pessoais. Trocar o código invalida o impresso. */
export const newBadgeToken = () => randomBytes(32).toString("base64url");

/** O QR leva prefixo fixo para o celular recusar QR de etiqueta ou de outro sistema. */
export const badgeQrText = (token: string) => `zelar:cracha:${token}`;

/** O celular recebe só o hash: com uma cópia do aparelho não dá para refazer crachás. */
export const badgeHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** O celular confere o PIN sem internet comparando este hash; o id do funcionário faz o papel de sal. */
export const pinHash = (workerId: string, pin: number[]) =>
  createHash("sha256").update(`zelo:pin:${workerId}:${pin.join("")}`).digest("hex");
