import { cacheLife } from "next/cache";

const REPO = process.env.NEXT_PUBLIC_ZELAR_RELEASES_REPO ?? "daviorlando/zelar";
export const TODAS_AS_VERSOES = `https://github.com/${REPO}/releases/latest`;

/** Endereço público da página de baixar, para o QR. Vazio se o site não tem endereço configurado. */
export function enderecoDaPaginaBaixar(): string | null {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return base ? `${base}/baixar` : null;
}

export type Apk = { url: string; mb: number };
export type Versao = {
  versao: string;
  data: string | null;
  principal: Apk;
  antigo: Apk | null;
  sha256: string | null;
};

type Asset = { name?: unknown; browser_download_url?: unknown; size?: unknown };

const CABECALHOS = { Accept: "application/vnd.github+json", "User-Agent": "zelar-painel" };

function comoApk(a: Asset | undefined): Apk | null {
  if (!a || typeof a.browser_download_url !== "string") return null;
  const bytes = typeof a.size === "number" ? a.size : 0;
  return { url: a.browser_download_url, mb: Math.max(1, Math.round(bytes / 1_048_576)) };
}

/** Última versão publicada no GitHub, ou null. Nunca lança: a página abre mesmo sem versão. */
export async function ultimaVersao(): Promise<Versao | null> {
  "use cache";
  const v = await buscar();
  // Falha não fica guardada por horas: a primeira versão publicada aparece logo.
  if (v) cacheLife("hours");
  else cacheLife("minutes");
  return v;
}

async function buscar(): Promise<Versao | null> {
  try {
    const r = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: CABECALHOS });
    if (!r.ok) return null;
    const rel = (await r.json()) as { tag_name?: unknown; published_at?: unknown; assets?: Asset[] };
    const assets = Array.isArray(rel.assets) ? rel.assets : [];
    const apks = assets.filter((a) => typeof a.name === "string" && a.name.endsWith(".apk"));
    const arm64 = apks.find((a) => (a.name as string).endsWith("-arm64.apk"));
    const arm32 = apks.find((a) => (a.name as string).endsWith("-arm32.apk"));
    const oferecido = arm64 ?? (apks.length === 1 ? apks[0] : arm32);
    const principal = comoApk(oferecido);
    if (!oferecido || !principal || typeof rel.tag_name !== "string") return null;
    const antigo = arm32 && arm32 !== oferecido ? comoApk(arm32) : null;

    // A soma é a do arquivo oferecido como principal, pelo nome exato ("<hash>  <nome>" ou
    // "<hash> *<nome>"): sem o arm64, procurar pelo nome errado mostrava a soma de outro APK.
    let sha256: string | null = null;
    const soma = comoApk(assets.find((a) => a.name === "SHA256SUMS.txt"));
    if (soma) {
      try {
        const t = await fetch(soma.url, { headers: CABECALHOS });
        if (t.ok) {
          for (const linha of (await t.text()).split("\n")) {
            const [h, nome] = linha.trim().split(/\s+\*?/);
            if (nome === oferecido.name && /^[0-9a-f]{64}$/i.test(h)) sha256 = h.toLowerCase();
          }
        }
      } catch {}
    }
    const publicado = typeof rel.published_at === "string" ? new Date(rel.published_at) : null;
    return {
      versao: rel.tag_name.replace(/^v/, ""),
      data:
        publicado && !Number.isNaN(publicado.getTime())
          ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" }).format(publicado)
          : null,
      principal,
      antigo,
      sha256,
    };
  } catch {
    return null;
  }
}
