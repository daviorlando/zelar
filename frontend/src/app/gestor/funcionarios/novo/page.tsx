import { connection } from "next/server";
import { Suspense } from "react";
import { EsqueletoDeDetalhe } from "@/components/zelar/esqueletos";
import { PageHeader } from "@/components/zelar/misc";
import { setoresComAtividades } from "@/lib/setores";
import { WorkerForm } from "../WorkerForm";

export const metadata = { title: "Novo funcionário" };

export default function NewWorkerPage() {
  return (
    <>
      <PageHeader eyebrow="Cadastros" title="Novo funcionário">
        Depois de salvar, imprima o crachá na tela do funcionário.
      </PageHeader>
      <Suspense fallback={<EsqueletoDeDetalhe />}>
        <Formulario />
      </Suspense>
    </>
  );
}

async function Formulario() {
  await connection();
  return <WorkerForm setores={await setoresComAtividades()} />;
}
