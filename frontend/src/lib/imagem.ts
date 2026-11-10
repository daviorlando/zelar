const LADO_MAXIMO = 1280;

/** Lado da foto quadrada da máquina: nítida no celular e bem abaixo do limite de envio. */
export const LADO_DO_RECORTE = 1024;

/** Foto de celular costuma passar do limite de envio: reduz no navegador antes de mandar. */
export async function reduzirImagem(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  tela.getContext("2d")!.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  return paraJpeg(tela);
}

/**
 * Enquadramento: a imagem cobre um quadro quadrado de lado `quadro` (px na tela), com `zoom` ≥ 1
 * e o canto de cima à esquerda em (x, y). Sem zoom, o lado menor da foto ocupa o quadro inteiro.
 */
export type Enquadramento = { largura: number; altura: number; quadro: number; zoom: number; x: number; y: number };

/** Escala da foto na tela: com zoom 1, o lado menor encosta no quadro. */
export const escalaDe = (e: Pick<Enquadramento, "largura" | "altura" | "quadro" | "zoom">) =>
  (e.quadro / Math.min(e.largura, e.altura)) * e.zoom;

/** Prende a foto para ela sempre cobrir o quadro: nunca sobra borda vazia. */
export function prender(e: Enquadramento): Enquadramento {
  const zoom = Math.min(Math.max(e.zoom, 1), 4);
  const s = escalaDe({ ...e, zoom });
  const entre = (v: number, min: number) => Math.min(0, Math.max(min, v));
  return { ...e, zoom, x: entre(e.x, e.quadro - e.largura * s), y: entre(e.y, e.quadro - e.altura * s) };
}

/** Começa centralizado, sem zoom. */
export function centralizar(largura: number, altura: number, quadro: number): Enquadramento {
  const s = escalaDe({ largura, altura, quadro, zoom: 1 });
  return { largura, altura, quadro, zoom: 1, x: (quadro - largura * s) / 2, y: (quadro - altura * s) / 2 };
}

/** Muda o zoom mantendo o centro do quadro no mesmo ponto da foto. */
export function aproximar(e: Enquadramento, zoom: number): Enquadramento {
  const antes = escalaDe(e);
  const centroX = (e.quadro / 2 - e.x) / antes;
  const centroY = (e.quadro / 2 - e.y) / antes;
  const depois = escalaDe({ ...e, zoom: Math.min(Math.max(zoom, 1), 4) });
  return prender({ ...e, zoom, x: e.quadro / 2 - centroX * depois, y: e.quadro / 2 - centroY * depois });
}

/** O pedaço da foto original (em pixels dela) que aparece no quadro. */
export function recorteDe(e: Enquadramento) {
  const p = prender(e);
  const s = escalaDe(p);
  const lado = Math.min(p.quadro / s, p.largura, p.altura);
  return {
    x: Math.min(Math.max(-p.x / s, 0), p.largura - lado),
    y: Math.min(Math.max(-p.y / s, 0), p.altura - lado),
    lado,
  };
}

/** Recorta o quadrado escolhido e reduz para no máximo [LADO_DO_RECORTE]. */
export async function recortarQuadrado(imagem: CanvasImageSource, e: Enquadramento): Promise<Blob> {
  const r = recorteDe(e);
  const saida = Math.max(1, Math.round(Math.min(LADO_DO_RECORTE, r.lado)));
  const tela = document.createElement("canvas");
  tela.width = saida;
  tela.height = saida;
  const c = tela.getContext("2d")!;
  c.imageSmoothingQuality = "high";
  c.drawImage(imagem, r.x, r.y, r.lado, r.lado, 0, 0, saida, saida);
  return paraJpeg(tela);
}

function paraJpeg(tela: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("sem imagem"))), "image/jpeg", 0.85),
  );
}
