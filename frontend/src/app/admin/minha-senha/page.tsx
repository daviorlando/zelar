import { Card } from "@/components/zelo/card";
import { PageHeader } from "@/components/zelo/misc";
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
