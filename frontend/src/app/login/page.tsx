import { Suspense } from "react";
import { Logo } from "@/components/zelo/logo";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Entrar" };

async function Form({ searchParams }: PageProps<"/login">) {
  const back = (await searchParams).voltar;
  return <LoginForm back={typeof back === "string" ? back : ""} />;
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
        <p className="mt-5 text-center text-xs text-muted-foreground">
          Problemas para entrar? Fale com o administrador do Zelo.
        </p>
      </section>
      <p className="vidro-cartao absolute bottom-5 rounded-full border px-3 py-1 text-xs text-muted-foreground">
        Zelo · Eco Gesso
      </p>
    </main>
  );
}
