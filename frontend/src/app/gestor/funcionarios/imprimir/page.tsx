import QRCode from "qrcode";
import { connection } from "next/server";
import { Suspense } from "react";
import { Card } from "@/components/zelar/card";
import { PageHeader } from "@/components/zelar/misc";
import { perfilAtual } from "@/lib/empresa";
import { supabaseForUser } from "@/lib/supabase/server";
import { badgeQrText, PHOTO_BUCKET, type Worker } from "@/lib/workers";
import { PrintButton } from "./PrintButton";

export const metadata = { title: "Imprimir crachás" };

export default function PrintPage(props: PageProps<"/gestor/funcionarios/imprimir">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-4 print:hidden">
        <div>
          <PageHeader eyebrow="Crachás" title="Imprimir crachás">
            Folha A4, tamanho de cartão (85 × 54 mm). Imprima em 100%, sem &quot;ajustar à página&quot;, e recorte nas linhas.
            Plastificar ajuda contra a poeira.
          </PageHeader>
        </div>
        <PrintButton />
      </div>
      <Suspense fallback={<Card>Gerando crachás…</Card>}>
        <Badges {...props} />
      </Suspense>
    </div>
  );
}

async function Badges({ searchParams }: PageProps<"/gestor/funcionarios/imprimir">) {
  // Dados do gestor conectado: sempre na hora do pedido, nunca no prerender.
  await connection();
  const raw = (await searchParams).ids;
  const ids = (Array.isArray(raw) ? raw : raw ? [raw] : []).flatMap((v) => v.split(","));
  if (ids.length === 0) return <Card>Nenhum funcionário marcado. Volte e marque quem vai receber crachá.</Card>;

  const empresa = (await perfilAtual())?.empresa ?? "";
  const supabase = await supabaseForUser();
  const { data, error } = await supabase
    .from("worker")
    .select("id, name, photo_path, badge_token, badge_version")
    .in("id", ids)
    .eq("active", true)
    .order("name");
  if (error) return <Card>Não consegui carregar: {error.message}</Card>;
  const workers = data as Pick<Worker, "id" | "name" | "photo_path" | "badge_token" | "badge_version">[];
  if (workers.length === 0) return <Card>Nenhum funcionário ativo entre os marcados. Reative o cadastro para imprimir o crachá.</Card>;

  const paths = workers.flatMap((w) => (w.photo_path ? [w.photo_path] : []));
  const signed = paths.length ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 600)).data : [];
  const photo = new Map(signed?.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
  const qrs = await Promise.all(
    workers.map((w) =>
      // Correção alta: o QR ainda lê com poeira ou risco no crachá.
      QRCode.toString(badgeQrText(w.badge_token), { type: "svg", errorCorrectionLevel: "H", margin: 1 }),
    ),
  );

  return (
    <div className="badge-sheet rounded-md bg-white p-4 print:rounded-none print:p-0">
      {workers.map((w, i) => (
        <article key={w.id} className="badge">
          <div className="badge-photo">
            {w.photo_path && photo.get(w.photo_path) ? (
              // eslint-disable-next-line @next/next/no-img-element -- URL assinada do Storage, impressão
              <img src={photo.get(w.photo_path)} alt="" />
            ) : (
              <span>sem foto</span>
            )}
          </div>
          <div className="badge-body">
            <p className="badge-brand">Zelar · {empresa}</p>
            <p className="badge-name">{w.name}</p>
            <p className="badge-meta">Crachá de entrada nº {w.badge_version}</p>
          </div>
          {/* SVG gerado no servidor pela biblioteca qrcode a partir de um código aleatório. */}
          <div className="badge-qr" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
        </article>
      ))}
    </div>
  );
}
