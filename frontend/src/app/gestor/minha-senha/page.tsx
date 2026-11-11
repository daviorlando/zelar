import { PageHeader } from "@/components/zelar/misc";
import { Card } from "@/components/zelar/card";
import { FormularioDeSenha } from "./formulario";

export const metadata = { title: "Minha senha" };

export default function MinhaSenhaPage() {
  return (
    <>
      <PageHeader eyebrow="Conta" title="Minha senha">
        Escolha uma senha só sua. Se você recebeu uma senha temporária, precisa trocá-la antes de usar o painel.
      </PageHeader>
      <Card className="max-w-md">
        <FormularioDeSenha />
      </Card>
    </>
  );
}
