import { connection } from "next/server";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/zelar/button";
import { Logo } from "@/components/zelar/logo";
import { exigirSuperAdmin } from "@/lib/empresa";

export const metadata = { title: { default: "Administração", template: "%s · Zelar" } };

/** Quem não é super-admin não vê esta área. Cada ação confere de novo: o layout não protege as ações. */
async function SoSuperAdmin({ children }: { children: React.ReactNode }) {
  await connection();
  if (!(await exigirSuperAdmin())) redirect("/gestor/quadro");
  return children;
}

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col gap-4 px-4 py-5">
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <form action={logout}>
          <Button variant="ghost">Sair</Button>
        </form>
      </header>
      <Suspense>
        <SoSuperAdmin>{children}</SoSuperAdmin>
      </Suspense>
    </div>
  );
}
