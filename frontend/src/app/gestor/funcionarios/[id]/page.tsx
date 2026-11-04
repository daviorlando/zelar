import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { button } from "@/components/zelo/button";
import { EsqueletoDeDetalhe } from "@/components/zelo/esqueletos";
import { Notice } from "@/components/zelo/feedback";
import { PageHeader } from "@/components/zelo/misc";
import { supabaseForUser } from "@/lib/supabase/server";
import { setoresComAtividades } from "@/lib/setores";
import { PHOTO_BUCKET, type Worker } from "@/lib/workers";
import { WorkerForm } from "../WorkerForm";

export const metadata = { title: "Funcionário" };

export default function EditWorkerPage(props: PageProps<"/gestor/funcionarios/[id]">) {
  return (
    <>
      <Suspense fallback={<EsqueletoDeDetalhe />}>
        <EditWorker {...props} />
      </Suspense>
    </>
  );
}

async function EditWorker({ params, searchParams }: PageProps<"/gestor/funcionarios/[id]">) {
  // Dados do gestor conectado: sempre na hora do pedido, nunca no prerender.
  await connection();
  const { id } = await params;
  const saved = (await searchParams).salvo === "1";
  const supabase = await supabaseForUser();
  const { data } = await supabase
    .from("worker")
    .select("id, name, pin, photo_path, badge_version, active")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const worker = data as Pick<Worker, "id" | "name" | "pin" | "photo_path" | "badge_version" | "active">;
  const [setores, marcados] = await Promise.all([
    setoresComAtividades(),
    supabase.from("worker_sector").select("sector_code").eq("worker_id", id),
  ]);
  const photoUrl = worker.photo_path
    ? (await supabase.storage.from(PHOTO_BUCKET).createSignedUrl(worker.photo_path, 3600)).data?.signedUrl
    : null;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <PageHeader eyebrow="Cadastros" title={worker.name}>
          {worker.active ? "Ativo" : "Desativado"} · crachá nº {worker.badge_version}
        </PageHeader>
        {worker.active && (
          <Link href={`/gestor/funcionarios/imprimir?ids=${worker.id}`} className={button({ variant: "primary" })}>
            Imprimir crachá
          </Link>
        )}
      </div>
      {saved && (
        <div className="mb-4">
          <Notice tone="ok">Salvo. O celular recebe a mudança na próxima vez que atualizar com internet.</Notice>
        </div>
      )}
      <WorkerForm
        key={worker.photo_path ?? "sem-foto"}
        worker={worker}
        photoUrl={photoUrl}
        setores={setores}
        marcados={(marcados.data ?? []).map((m) => m.sector_code)}
      />
    </>
  );
}
