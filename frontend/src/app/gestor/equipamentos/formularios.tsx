"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/zelo/button";
import { ConfirmDialog } from "@/components/zelo/confirmacao";
import { Field, Input, NativeSelect } from "@/components/zelo/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FREQUENCIAS,
  ROTULO_FREQUENCIA,
  ROTULO_TIPO,
  SUFIXOS_DE_COMPONENTE,
  TIPOS_DE_ITEM,
  type Atividade,
  type Equipamento,
  type TipoDeItem,
} from "@/lib/plano";
import type { Resultado } from "./actions";

type Acao = (form: FormData) => Promise<Resultado>;

/** Botão de abrir: "Novo …" com texto, "Editar" com texto (cabeçalho) ou só o lápis (linha de tabela). */
function Gatilho({ rotulo, editar, aoClicar }: { rotulo: string; editar?: boolean | "texto"; aoClicar: () => void }) {
  if (editar === true)
    return (
      <button
        type="button"
        onClick={aoClicar}
        title={rotulo}
        className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <Pencil className="size-4" aria-hidden />
        <span className="sr-only">{rotulo}</span>
      </button>
    );
  return (
    <Button size="small" onClick={aoClicar}>
      {editar ? <Pencil className="size-4" aria-hidden /> : <Plus className="size-4" aria-hidden />} {rotulo}
    </Button>
  );
}

/**
 * Formulário em diálogo: envia para a ação do servidor, mostra o erro no próprio
 * diálogo ou fecha com um aviso. `irPara` leva à página do registro criado.
 */
function DialogoDeCadastro({
  rotulo,
  editar,
  titulo,
  descricao,
  acao,
  irPara,
  aoAbrir,
  children,
}: {
  aoAbrir?: () => void;
  rotulo: string;
  editar?: boolean | "texto";
  titulo: string;
  descricao?: string;
  acao: Acao;
  irPara?: (id: string) => string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erro, setErro] = useState<string>();
  const [salvando, iniciar] = useTransition();

  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    iniciar(async () => {
      const r = await acao(form);
      if (r.erro) return setErro(r.erro);
      setAberto(false);
      toast.success(r.ok ?? "Salvo.");
      if (irPara && r.id) router.push(irPara(r.id));
    });
  }

  return (
    <>
      <Gatilho
        rotulo={rotulo}
        editar={editar}
        aoClicar={() => {
          setErro(undefined);
          aoAbrir?.();
          setAberto(true);
        }}
      />
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
          <form onSubmit={enviar} className="flex flex-col gap-4">
            <DialogHeader>
              <DialogTitle>{titulo}</DialogTitle>
              {descricao && <DialogDescription>{descricao}</DialogDescription>}
            </DialogHeader>
            <div className="flex flex-col gap-3">{children}</div>
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Voltar
              </Button>
              <Button variant="primary" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Lixeira com confirmação. `irPara` sai da página do que foi excluído. */
export function BotaoExcluir({
  rotulo,
  titulo,
  explicacao,
  acao,
  irPara,
  comTexto,
}: {
  rotulo: string;
  titulo: string;
  explicacao: string;
  acao: () => Promise<Resultado>;
  irPara?: string;
  comTexto?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [excluindo, iniciar] = useTransition();
  return (
    <>
      {comTexto ? (
        <Button size="small" variant="danger" onClick={() => setAberto(true)}>
          <Trash2 className="size-4" aria-hidden /> {rotulo}
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setAberto(true)}
          title={rotulo}
          className="grid size-8 place-items-center rounded-sm text-muted-foreground hover:bg-destructive-soft hover:text-destructive"
        >
          <Trash2 className="size-4" aria-hidden />
          <span className="sr-only">{rotulo}</span>
        </button>
      )}
      <ConfirmDialog
        aberto={aberto}
        aoMudar={setAberto}
        titulo={titulo}
        confirmar="Excluir"
        variante="destructive"
        ocupado={excluindo}
        aoConfirmar={() =>
          iniciar(async () => {
            const r = await acao();
            setAberto(false);
            if (r.erro) return void toast.error(r.erro);
            toast.success(r.ok ?? "Excluído.");
            if (irPara) router.push(irPara);
          })
        }
      >
        {explicacao}
      </ConfirmDialog>
    </>
  );
}

/* ── Setor ───────────────────────────────────────────────────────────── */

export function FormularioDeSetor({ acao, setor }: { acao: Acao; setor?: { code: string; name: string } }) {
  return (
    <DialogoDeCadastro
      rotulo={setor ? `Editar setor ${setor.code}` : "Novo setor"}
      editar={!!setor}
      titulo={setor ? `Setor ${setor.code}` : "Novo setor"}
      descricao="O código é a letra que abre as tags dos equipamentos do setor (A - BMAN)."
      acao={acao}
    >
      {!setor && <input type="hidden" name="novo" value="1" />}
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Letra" htmlFor="setor-codigo">
          <Input
            id="setor-codigo"
            name="code"
            defaultValue={setor?.code}
            readOnly={!!setor}
            required
            maxLength={1}
            pattern="[A-Za-z]"
            className="uppercase"
            autoComplete="off"
          />
        </Field>
        <Field label="Nome" htmlFor="setor-nome">
          <Input id="setor-nome" name="name" defaultValue={setor?.name} required maxLength={60} autoComplete="off" />
        </Field>
      </div>
    </DialogoDeCadastro>
  );
}

/* ── Equipamento e componente ────────────────────────────────────────── */

/** Campos técnicos comuns a equipamento e componente. */
function CamposTecnicos({ e }: { e?: Equipamento }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label="Marca" htmlFor="eq-marca">
        <Input id="eq-marca" name="brand" defaultValue={e?.brand ?? ""} maxLength={60} />
      </Field>
      <Field label="Modelo" htmlFor="eq-modelo">
        <Input id="eq-modelo" name="model" defaultValue={e?.model ?? ""} maxLength={60} />
      </Field>
      <Field label="Potência (CV)" htmlFor="eq-cv">
        <Input id="eq-cv" name="power_cv" inputMode="decimal" defaultValue={e?.power_cv ?? ""} />
      </Field>
      <Field label="Rotação (RPM)" htmlFor="eq-rpm">
        <Input id="eq-rpm" name="rpm" inputMode="decimal" defaultValue={e?.rpm ?? ""} />
      </Field>
      <Field label="Temperatura de trabalho" htmlFor="eq-temp">
        <Input id="eq-temp" name="working_temp" defaultValue={e?.working_temp ?? ""} maxLength={40} />
      </Field>
      <Field label="Lubrificante" htmlFor="eq-lub">
        <Input id="eq-lub" name="lubricant" defaultValue={e?.lubricant ?? ""} maxLength={60} />
      </Field>
    </div>
  );
}

export function FormularioDeEquipamento({
  acao,
  setores,
  equipamento,
}: {
  acao: Acao;
  setores: string[];
  equipamento?: Equipamento;
}) {
  const [setor, setSetor] = useState(equipamento?.sector_code ?? setores[0] ?? "");
  const codigo = equipamento ? equipamento.tag.slice(equipamento.sector_code.length + 3) : "";
  return (
    <DialogoDeCadastro
      rotulo={equipamento ? "Editar" : "Novo equipamento"}
      editar={equipamento ? "texto" : undefined}
      titulo={equipamento ? `Editar ${equipamento.tag}` : "Novo equipamento"}
      descricao={
        equipamento
          ? "Mudar a tag ou o setor leva junto os componentes e as atividades."
          : "Depois de criar, acrescente os componentes e as atividades na página dele."
      }
      acao={acao}
      irPara={equipamento ? undefined : (id) => `/gestor/equipamentos/${id}`}
    >
      {equipamento && <input type="hidden" name="id" value={equipamento.id} />}
      <div className="grid grid-cols-[6rem_1fr] gap-3">
        <Field label="Setor" htmlFor="eq-setor">
          <NativeSelect id="eq-setor" name="sector_code" value={setor} onChange={(e) => setSetor(e.target.value)} required>
            {setores.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label={`Tag: ${setor} - …`} htmlFor="eq-codigo">
          <Input id="eq-codigo" name="codigo" defaultValue={codigo} required maxLength={20} placeholder="BMAN" className="uppercase" autoComplete="off" />
        </Field>
      </div>
      <Field label="Nome" htmlFor="eq-nome">
        <Input id="eq-nome" name="name" defaultValue={equipamento?.name ?? ""} required maxLength={120} placeholder="Britador de mandíbula" />
      </Field>
      <CamposTecnicos e={equipamento} />
    </DialogoDeCadastro>
  );
}

export function FormularioDeComponente({
  acao,
  principal,
  componente,
}: {
  acao: Acao;
  principal: Pick<Equipamento, "id" | "tag">;
  componente?: Equipamento;
}) {
  const sufixo = componente ? componente.tag.slice(principal.tag.length + 3) : "";
  return (
    <DialogoDeCadastro
      rotulo={componente ? `Editar ${componente.tag}` : "Novo componente"}
      editar={!!componente}
      titulo={componente ? `Editar ${componente.tag}` : `Novo componente de ${principal.tag}`}
      descricao={`O final da tag diz ao celular que desenho mostrar: ${SUFIXOS_DE_COMPONENTE}. Numere quando houver mais de um (ROL1, ROL2).`}
      acao={acao}
    >
      {componente && <input type="hidden" name="id" value={componente.id} />}
      <input type="hidden" name="parent_id" value={principal.id} />
      <div className="grid grid-cols-[1fr_1.4fr] gap-3">
        <Field label={`Tag: ${principal.tag} - …`} htmlFor="comp-codigo">
          <Input id="comp-codigo" name="codigo" defaultValue={sufixo} required maxLength={12} placeholder="ME" className="uppercase" autoComplete="off" />
        </Field>
        <Field label="Nome" htmlFor="comp-nome">
          <Input id="comp-nome" name="name" defaultValue={componente?.name ?? ""} maxLength={120} placeholder="Motor 5 CV" />
        </Field>
      </div>
      <CamposTecnicos e={componente} />
    </DialogoDeCadastro>
  );
}

/* ── Atividade ───────────────────────────────────────────────────────── */

export function FormularioDeAtividade({
  acao,
  alvos,
  atividade,
  frequencia,
}: {
  acao: Acao;
  /** O equipamento principal e os componentes dele. */
  alvos: Pick<Equipamento, "id" | "tag" | "name">[];
  atividade?: Atividade;
  frequencia?: string;
}) {
  const tipoInicial = atividade?.item_type ?? "inspection";
  const [tipo, setTipo] = useState<TipoDeItem>(tipoInicial);
  return (
    <DialogoDeCadastro
      // Cada abertura começa do zero: o tipo da atividade anterior não pode passar para a próxima.
      aoAbrir={() => setTipo(tipoInicial)}
      rotulo={atividade ? "Editar atividade" : "Nova atividade"}
      editar={!!atividade}
      titulo={atividade ? "Editar atividade" : "Nova atividade"}
      descricao="Entra nas ordens abertas na hora. O celular lê a descrição em voz alta para o funcionário."
      acao={acao}
    >
      {atividade && <input type="hidden" name="id" value={atividade.id} />}
      <Field label="Onde" htmlFor="at-alvo">
        <NativeSelect id="at-alvo" name="equipment_id" defaultValue={atividade?.equipment_id ?? alvos[0]?.id} required>
          {alvos.map((a, i) => (
            <option key={a.id} value={a.id}>
              {a.tag}
              {a.name ? ` · ${a.name}` : ""}
              {i === 0 ? " (o equipamento todo)" : ""}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Frequência" htmlFor="at-freq">
          <NativeSelect id="at-freq" name="frequency" defaultValue={atividade?.frequency ?? frequencia ?? "weekly"} required>
            {FREQUENCIAS.map((f) => (
              <option key={f} value={f}>
                {ROTULO_FREQUENCIA[f]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Nome curto" htmlFor="at-resumo">
          <Input
            id="at-resumo"
            name="instruction_kind"
            defaultValue={atividade?.instruction_kind ?? ""}
            required
            maxLength={60}
            placeholder="inspeção visual"
          />
        </Field>
      </div>
      <Field label="Como o funcionário responde" htmlFor="at-tipo">
        <NativeSelect id="at-tipo" name="item_type" value={tipo} onChange={(e) => setTipo(e.target.value as TipoDeItem)}>
          {TIPOS_DE_ITEM.map((t) => (
            <option key={t} value={t}>
              {ROTULO_TIPO[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Descrição" htmlFor="at-texto">
        <textarea
          id="at-texto"
          name="activity"
          defaultValue={atividade?.activity}
          required
          rows={3}
          maxLength={1000}
          placeholder="Verificar vazamentos de óleo e ruídos anormais."
          className="w-full rounded-sm border border-input bg-card px-2.5 py-2 text-md text-foreground placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/40 focus:outline-none"
        />
      </Field>
      {tipo === "measurement" && (
        <div className="grid grid-cols-3 gap-3">
          <Field label="Unidade" htmlFor="at-unidade">
            <Input id="at-unidade" name="measurement_unit" defaultValue={atividade?.measurement_unit ?? ""} maxLength={12} placeholder="A, °C, mm" />
          </Field>
          <Field label="Mínimo" htmlFor="at-min">
            <Input id="at-min" name="measurement_min" inputMode="decimal" defaultValue={atividade?.measurement_min ?? ""} />
          </Field>
          <Field label="Máximo" htmlFor="at-max">
            <Input id="at-max" name="measurement_max" inputMode="decimal" defaultValue={atividade?.measurement_max ?? ""} />
          </Field>
        </div>
      )}
    </DialogoDeCadastro>
  );
}
