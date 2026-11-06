import Link from "next/link";
import { Logo } from "@/components/zelo/logo";
import { FormularioEsqueci } from "./formulario";

export const metadata = { title: "Esqueci minha senha" };

export default function EsqueciPage() {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      <section className="vidro w-full max-w-sm rounded-lg border border-glass-border p-7 shadow-[var(--shadow-dialog)]">
        <Logo />
        <h1 className="mt-6 font-[family-name:var(--font-display)] text-xl text-foreground">Esqueci minha senha</h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Enviamos um link para você criar uma senha nova.</p>
        <FormularioEsqueci />
        <p className="mt-5 text-center text-sm">
          <Link href="/login" className="text-muted-foreground underline">
            Voltar para entrar
          </Link>
        </p>
      </section>
    </main>
  );
}
