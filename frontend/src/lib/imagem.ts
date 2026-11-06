const LADO_MAXIMO = 1280;

/** Foto de celular costuma passar do limite de envio: reduz no navegador antes de mandar. */
export async function reduzirImagem(arquivo: File): Promise<Blob> {
  const imagem = await createImageBitmap(arquivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(imagem.width, imagem.height));
  const tela = document.createElement("canvas");
  tela.width = Math.round(imagem.width * escala);
  tela.height = Math.round(imagem.height * escala);
  tela.getContext("2d")!.drawImage(imagem, 0, 0, tela.width, tela.height);
  imagem.close();
  return new Promise((resolver, rejeitar) =>
    tela.toBlob((b) => (b ? resolver(b) : rejeitar(new Error("sem imagem"))), "image/jpeg", 0.85),
  );
}
