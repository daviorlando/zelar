import { Suspense } from "react";
import { Logo } from "@/components/zelo/logo";
import { Confirmar } from "./confirmar";

export const metadata = { title: "Confirmar acesso" };

async function Formulario({ searchParams }: PageProps<"/auth/confirm">) {
  const { token_hash: token, type: tipo } = await searchParams;
  if (typeof token !== "string" || (tipo !== "invite" && tipo !== "recovery")) {
    return <p className="text-sm text-destructive">Link inválido. Peça um novo a quem convidou você ou use “Esqueci minha senha”.</p>;
  }
  return <Confirmar token={token} tipo={tipo} />;
}

/** O email traz o link; só o clique no botão usa o código. Antivírus de email abre links sozinho e consumiria o convite. */
export default function ConfirmarPage(props: PageProps<"/auth/confirm">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <section className="vidro w-full max-w-sm rounded-lg border border-glass-border p-7 shadow-[var(--shadow-dialog)]">
        <Logo />
        <h1 className="mb-4 mt-6 font-[family-name:var(--font-display)] text-xl text-foreground">Criar sua senha</h1>
        <Suspense>
          <Formulario {...props} />
        </Suspense>
      </section>
    </main>
  );
}
