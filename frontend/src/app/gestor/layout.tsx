import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { Avatar } from "@/components/zelo/painel/avatar";
import { Busca } from "@/components/zelo/painel/busca";
import { PainelShell } from "@/components/zelo/painel/shell";
import { VoltarDoTopo } from "@/components/zelo/voltar";
import { perfilAtual } from "@/lib/empresa";

export default function GestorLayout({ children }: LayoutProps<"/gestor">) {
  return (
    <PainelShell
      topo={
        <header className="flex items-center gap-3 px-4 pt-4 md:px-6 md:pt-3 md:pb-4 print:hidden">
          {/* À esquerda, o voltar das telas de detalhe (lê a rota: dentro de Suspense). */}
          <Suspense>
            <VoltarDoTopo />
          </Suspense>
          {/* À direita, busca e quem está conectado, com a empresa. No celular a busca não
              cabe e o Sair fica no menu, então esse cartão sai. */}
          <div className="vidro-cartao ml-auto hidden items-center gap-3 rounded-md border px-2.5 py-2 md:flex">
            <Busca />
            <Suspense fallback={<Avatar nome="" />}>
              <Gestor />
            </Suspense>
          </div>
        </header>
      }
    >
      {children}
    </PainelShell>
  );
}

async function Gestor() {
  await connection();
  const perfil = await perfilAtual();
  if (perfil?.papel === "super_admin") redirect("/admin/empresas");
  // Conta sem empresa ou empresa desativada: o RLS já esconde os dados; aqui ela entende o porquê.
  if (!perfil?.empresa) redirect("/login?sem_acesso=1");
  const email = perfil.email;
  return (
    <span className="flex items-center gap-2.5 border-l border-border pl-3" title={email}>
      <span className="hidden text-right leading-tight sm:block">
        <span className="block text-sm font-medium text-foreground">{perfil.empresa}</span>
        <span className="block max-w-40 truncate text-xs text-muted-foreground">{email}</span>
      </span>
      <Avatar nome={email} />
    </span>
  );
}
