"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/zelo/badge";
import { supabaseDoNavegador } from "@/lib/supabase/browser";

/** Agrupa a rajada de eventos de um lote do celular numa atualização só. */
const AGRUPAR_MS = 250;
/** Rede de segurança caso a conexão ao vivo caia sem avisar. */
const RESERVA_MS = 30_000;

/**
 * Mantém o quadro em dia sozinho: cada mudança em work_order (resposta do celular,
 * validação de outro gestor, geração de ordens) recarrega os dados da página, com
 * os filtros atuais. Não desenha cartões: quem desenha continua sendo o servidor.
 */
export function AoVivo() {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = supabaseDoNavegador();
    let espera: ReturnType<typeof setTimeout> | undefined;
    let desmontado = false;

    const atualizar = () => {
      clearTimeout(espera);
      espera = setTimeout(() => router.refresh(), AGRUPAR_MS);
    };

    const canal = supabase.channel("quadro-de-ordens").on(
      "postgres_changes",
      { event: "*", schema: "public", table: "work_order" },
      atualizar,
    );

    // O token precisa estar no Realtime antes de assinar: sem ele o RLS não entrega nada.
    void supabase.auth.getSession().then(({ data }) => {
      if (desmontado) return;
      if (data.session) void supabase.realtime.setAuth(data.session.access_token);
      canal.subscribe((estado) => {
        const ligado = estado === "SUBSCRIBED";
        setConectado(ligado);
        // Ao (re)conectar, busca o que mudou enquanto estava sem conexão.
        if (ligado) atualizar();
      });
    });

    const reserva = setInterval(() => {
      if (!document.hidden) atualizar();
    }, RESERVA_MS);
    const aoVoltar = () => {
      if (!document.hidden) atualizar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      desmontado = true;
      clearTimeout(espera);
      clearInterval(reserva);
      document.removeEventListener("visibilitychange", aoVoltar);
      void supabase.removeChannel(canal);
    };
  }, [router]);

  return (
    <div className="mb-2 flex justify-end" role="status">
      <Badge tone={conectado ? "ok" : "warn"}>{conectado ? "Ao vivo" : "Reconectando: atualiza a cada 30 s"}</Badge>
    </div>
  );
}
