import QRCode from "qrcode";

/**
 * QR code em SVG, gerado no servidor. Sempre preto sobre branco, nos dois temas:
 * a câmera não lê QR claro sobre fundo escuro.
 */
export async function Qr({ texto, rotulo, className }: { texto: string; rotulo: string; className?: string }) {
  const svg = await QRCode.toString(texto, { type: "svg", errorCorrectionLevel: "M", margin: 2 });
  return (
    <div
      role="img"
      aria-label={rotulo}
      className={`aspect-square overflow-hidden rounded-sm bg-white [&>svg]:size-full ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
