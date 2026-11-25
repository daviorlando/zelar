"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/zelar/badge";
import { supabaseDoNavegador } from "@/lib/supabase/browser";

/** Agrupa a rajada de eventos de um lote do celular numa atualização só. */
const AGRUPAR_MS = 250;
/** No máximo uma atualização a cada 5 s: com vários celulares enviando, cada evento recarregava a página. */
const INTERVALO_MS = 5_000;
/** Rede de segurança caso a conexão ao vivo caia sem avisar. */
const RESERVA_MS = 30_000;

/**
 * Mantém o quadro em dia sozinho: cada mudança em work_order (toda resposta do celular,
 * que recalcula a ordem mesmo sem mudar a situação; validação de outro gestor; geração
 * de ordens) recarrega os dados da página com os filtros atuais, no máximo uma vez a
 * cada 5 s. Não desenha cartões: quem desenha continua sendo o servidor.
 */
export function AoVivo() {
  const router = useRouter();
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = supabaseDoNavegador();
    let espera: ReturnType<typeof setTimeout> | undefined;
    let ultima = 0;
    let desmontado = false;

    // Já agendada: o evento entra nela. Senão agenda para o fim do intervalo (nunca perde o último).
    const atualizar = () => {
      if (espera) return;
      espera = setTimeout(
        () => {
          espera = undefined;
          ultima = Date.now();
          router.refresh();
        },
        Math.max(AGRUPAR_MS, ultima + INTERVALO_MS - Date.now()),
      );
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
