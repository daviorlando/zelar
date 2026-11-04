"use client";

import { Cog, LayoutGrid, LogOut, Moon, Rocket, ShieldCheck, Sun, Users } from "lucide-react";
import { Suspense, type ReactNode } from "react";

import {
  AcaoDaBarra,
  Sidebar,
  SidebarProvider,
  type GrupoDeNavegacao,
} from "@/components/zelo/sidebar";
import { logout } from "@/app/login/actions";
import { alternarTema, useTemaClaro } from "@/lib/tema";

/* Seções do painel: o Quadro é o uso diário; o resto é configuração. */
const GRUPOS: GrupoDeNavegacao[] = [
  {
    id: "acompanhar",
    label: "Acompanhar",
    itens: [{ href: "/gestor/quadro", label: "Quadro", icon: LayoutGrid }],
  },
  {
    // Uso de vez em quando: cadastro de pessoas, equipamentos e plano de manutenção.
    id: "configuracao",
    label: "Configuração",
    itens: [
      { href: "/gestor/implantacao", label: "Implantação", icon: Rocket },
      { href: "/gestor/funcionarios", label: "Funcionários", icon: Users },
      { href: "/gestor/equipamentos", label: "Equipamentos", icon: Cog },
      { href: "/gestor/gestores", label: "Gestores", icon: ShieldCheck },
    ],
  },
];

export function PainelShell({
  topo,
  children,
}: {
  topo: ReactNode;
  children: ReactNode;
}) {
  return (
    <SidebarProvider>
      <div className="min-[75rem]:flex">
        {/* A barra lê a rota atual (item ativo): com cacheComponents isso fica dentro
            de Suspense, e o reservado tem a largura da barra para nada pular. */}
        <Suspense
          fallback={<div className="hidden w-64 shrink-0 min-[75rem]:block" />}
        >
          <Sidebar
            grupos={GRUPOS}
            rodape={(recolhida) => (
              <div className="flex flex-col gap-1">
                <AlternarTema recolhida={recolhida} />
                <form action={logout}>
                  <AcaoDaBarra type="submit" icon={LogOut} label="Sair" recolhida={recolhida} />
                </form>
              </div>
            )}
          />
        </Suspense>
        <div className="min-w-0 flex-1">
          {topo}
          <main className="px-4 pb-12 pt-4 md:px-6 md:pt-0">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}

/* Tema no padrão dos itens da barra: ícone fixo, rótulo que esmaece ao recolher. */
function AlternarTema({ recolhida }: { recolhida: boolean }) {
  const claro = useTemaClaro();
  return (
    <AcaoDaBarra
      icon={claro ? Moon : Sun}
      label={claro ? "Tema escuro" : "Tema claro"}
      recolhida={recolhida}
      aria-pressed={claro}
      onClick={() => alternarTema(!claro)}
    />
  );
}
