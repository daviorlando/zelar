import { Card } from "@/components/zelar/card";
import { PageHeader } from "@/components/zelar/misc";
import { FormularioDeSenha } from "@/app/gestor/minha-senha/formulario";

export const metadata = { title: "Minha senha" };

export default function MinhaSenhaDoAdminPage() {
  return (
    <>
      <PageHeader eyebrow="Conta" title="Minha senha">
        Escolha uma senha só sua.
      </PageHeader>
      <Card className="max-w-md">
        <FormularioDeSenha depois="/admin/empresas" />
      </Card>
    </>
  );
}
