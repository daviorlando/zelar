import Link from "next/link";
import { Suspense } from "react";
import { Logo } from "@/components/zelar/logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

async function Form({ searchParams }: PageProps<"/login">) {
  const { voltar: back, sem_acesso: semAcesso } = await searchParams;
  return (
    <>
      {semAcesso && (
        <p role="alert" className="mb-4 rounded-sm border border-warning bg-warning-soft px-3 py-2 text-sm text-warning">
          Esta conta não tem acesso a nenhuma empresa ativa. Fale com o administrador do Zelar.
        </p>
      )}
      <LoginForm back={typeof back === "string" ? back : ""} />
    </>
  );
}

export default function LoginPage(props: PageProps<"/login">) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-16">
      {/* Cartão de vidro central, como "Web / Login — entrar" do Figma. */}
      <section
        aria-labelledby="titulo-login"
        className="vidro w-full max-w-sm rounded-lg border border-glass-border p-7 shadow-[var(--shadow-dialog)]"
      >
        <Logo />
        <h1 id="titulo-login" className="mt-6 font-[family-name:var(--font-display)] text-xl text-foreground">
          Entrar
        </h1>
        <p className="mb-5 mt-1 text-sm text-muted-foreground">Acompanhamento da manutenção da fábrica.</p>
        <Suspense>
          <Form {...props} />
        </Suspense>
        <p className="mt-5 text-center text-sm">
          <Link href="/login/esqueci" className="text-muted-foreground underline">
            Esqueci minha senha
          </Link>
        </p>
      </section>
      <p className="vidro-cartao absolute bottom-5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Zelar
      </p>
    </main>
  );
}
