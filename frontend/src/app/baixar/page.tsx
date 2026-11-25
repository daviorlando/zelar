import { Download, Settings, Smartphone } from "lucide-react";
import { Logo } from "@/components/zelar/logo";
import { button } from "@/components/zelar/button";
import { Qr } from "@/components/zelar/qr";
import { enderecoDaPaginaBaixar, TODAS_AS_VERSOES, ultimaVersao } from "@/lib/app-android";

export const metadata = { title: "Baixar o app · Zelar" };

const passos = [
  { icone: Download, titulo: "Baixar", texto: "Toque em “Baixar o app”. O arquivo vai para o celular." },
  {
    icone: Settings,
    titulo: "Permitir instalar",
    texto: "O Android vai avisar. Toque em Configurações e ligue “Permitir desta fonte”. Depois volte e toque em Instalar.",
  },
  {
    icone: Smartphone,
    titulo: "Abrir o Zelar",
    texto: "Abra o app e digite o código que o gestor mostra na tela Celulares.",
  },
];

export default async function BaixarPage() {
  const v = await ultimaVersao();
  const endereco = enderecoDaPaginaBaixar();
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col justify-center px-4 py-10 sm:py-14">
      <Logo />
      <div className="mt-8 grid gap-8 lg:mt-10 lg:grid-cols-[1fr_auto] lg:gap-14">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl text-foreground sm:text-4xl">
            Baixe o Zelar no celular
          </h1>
          <p className="mt-2 text-md text-muted-foreground">Funciona em Android 10 ou mais novo.</p>

          <div className="mt-6 flex flex-col items-stretch gap-2 sm:max-w-xs">
            <a
              href={v?.principal.url ?? TODAS_AS_VERSOES}
              download={v ? "" : undefined}
              className={button({ variant: "primary", size: "large", className: "w-full" })}
            >
              <Download className="size-5" aria-hidden /> Baixar o app
            </a>
            {v && (
              <p className="num text-center text-sm text-muted-foreground">
                versão {v.versao} · {v.principal.mb} MB
              </p>
            )}
          </div>

          <ol className="mt-8 flex flex-col gap-4">
            {passos.map(({ icone: Icone, titulo, texto }, i) => (
              <li key={titulo} className="flex gap-3">
                <span className="num flex size-9 shrink-0 items-center justify-center rounded-full border border-border bg-card text-sm font-medium text-foreground">
                  {i + 1}
                </span>
                <div>
                  <h2 className="flex items-center gap-2 text-md font-medium text-foreground">
                    <Icone className="size-4 text-brand-text" aria-hidden /> {titulo}
                  </h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{texto}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 flex flex-col gap-2 text-sm">
            {v?.antigo && (
              <a href={v.antigo.url} className="w-fit text-muted-foreground underline">
                Celular antigo? Baixe esta versão
              </a>
            )}
            <a href={TODAS_AS_VERSOES} className="w-fit text-muted-foreground underline">
              Todas as versões no GitHub
            </a>
            {v?.sha256 && (
              <details className="text-muted-foreground">
                <summary className="w-fit cursor-pointer underline">Conferir o arquivo (SHA-256)</summary>
                <code className="num mt-2 block break-all rounded-sm border border-border bg-card px-3 py-2 text-xs text-foreground">
                  {v.sha256}
                </code>
              </details>
            )}
            {v?.data && <p className="text-xs text-muted-foreground">Publicada em {v.data}.</p>}
          </div>
        </div>

        {endereco && (
          <aside className="hidden self-center lg:block" aria-label="QR do celular">
            <div className="vidro w-60 rounded-lg border border-glass-border p-4 text-center shadow-[var(--shadow-dialog)]">
              <Qr texto={endereco} rotulo="QR code desta página" />
              <p className="mt-3 text-sm text-muted-foreground">Aponte a câmera do celular</p>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
