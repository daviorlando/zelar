"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeft, X } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Logo, NomeDaMarca } from "@/components/zelo/logo";
import { alternarBarra, useBarraAberta } from "@/lib/nav";
import { cn } from "@/lib/utils";

/*
 * A barra do painel, escrita à mão e não instalada do registry.
 *
 * O `npx shadcn add sidebar` traria seis tokens `--sidebar-*` que este
 * `globals.css` não tem — criá-los significaria inventá-los também no Figma,
 * enquanto `bg-card` + `border-border` + `bg-primary-soft` no ativo já dizem a
 * mesma coisa com o vocabulário da casa. Traria junto Sheet, Separator, um
 * segundo Skeleton e um `SidebarProvider` com cookie que existe para resolver
 * lampejo de SSR, que aqui não acontece: o layout é `"use client"` e o
 * `SessionProvider` já mostra esqueleto enquanto carrega.
 */

/*
 * A barra fica ao lado do conteúdo a partir de 1200px; abaixo disso vira
 * sobreposição. O ponto de corte aparece escrito por extenso em cada classe,
 * e não montado a partir de uma constante: o Tailwind varre o código-fonte
 * procurando classes **literais**, e `${PREFIXO}flex` não existe para ele —
 * a regra nunca chega ao CSS e o elemento fica `hidden` para sempre.
 */

export interface ItemDeNavegacao {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  /** Sem ela, o item some do menu. */
  permission?: string;
  /** Só fica ativo em correspondência exata — para a raiz do painel. */
  exato?: boolean;
}

export interface GrupoDeNavegacao {
  id: string;
  label: string;
  itens: ItemDeNavegacao[];
}

interface EstadoDaBarra {
  /** Aberta com rótulos (contra trilho de ícones). Só vale lado a lado. */
  aberta: boolean;
  alternar: () => void;
  /** A sobreposição das telas estreitas. */
  sobreposta: boolean;
  abrirSobreposta: () => void;
  fecharSobreposta: () => void;
}

const Ctx = createContext<EstadoDaBarra | null>(null);

export function useSidebar(): EstadoDaBarra {
  const estado = useContext(Ctx);
  if (!estado) throw new Error("useSidebar fora de <SidebarProvider>");
  return estado;
}

function digitando(alvo: EventTarget | null): boolean {
  if (!(alvo instanceof HTMLElement)) return false;
  if (alvo.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName);
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const aberta = useBarraAberta();
  const [sobreposta, setSobreposta] = useState(false);

  const alternar = useCallback(() => alternarBarra(), []);
  const abrirSobreposta = useCallback(() => setSobreposta(true), []);
  const fecharSobreposta = useCallback(() => setSobreposta(false), []);

  /*
   * Cmd/Ctrl+B. Combo com modificador fica fora do alcance do SC 2.1.4 da
   * WCAG, que só restringe atalho de tecla única imprimível. Ainda assim sai
   * de cena quando o foco está num campo de texto: em alguns editores o mesmo
   * combo é "negrito", e roubá-lo seria pior que não ter atalho.
   */
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      // `key` pode não existir: o gerenciador de senhas do navegador e alguns
      // métodos de entrada disparam `keydown` sintético sem ela, e ler
      // `.toLowerCase()` ali derrubava a tela inteira.
      if (evento.key?.toLowerCase() !== "b") return;
      if (!(evento.metaKey || evento.ctrlKey) || evento.altKey || evento.shiftKey) return;
      if (digitando(evento.target)) return;
      evento.preventDefault();
      alternarBarra();
    };
    document.addEventListener("keydown", aoTeclar);
    return () => document.removeEventListener("keydown", aoTeclar);
  }, []);

  const valor = useMemo(
    () => ({ aberta, alternar, sobreposta, abrirSobreposta, fecharSobreposta }),
    [aberta, alternar, sobreposta, abrirSobreposta, fecharSobreposta],
  );

  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

/**
 * Qual item corresponde à rota atual.
 *
 * Não basta `startsWith`: um item que more sob o endereço de outro (como a
 * Caixa de entrada morou em `/painel/demandas/…`) faria as duas entradas
 * acenderem ao mesmo tempo. Vence sempre a correspondência mais específica.
 */
function hrefAtivo(pathname: string, itens: ItemDeNavegacao[]): string | null {
  let melhor: string | null = null;
  for (const item of itens) {
    const casa = item.exato
      ? pathname === item.href
      : pathname === item.href || pathname.startsWith(item.href + "/");
    if (!casa) continue;
    if (melhor === null || item.href.length > melhor.length) melhor = item.href;
  }
  return melhor;
}

/*
 * Item com o ícone SEMPRE no mesmo lugar: o padding não muda ao recolher, só a
 * largura do trilho. Com o trilho em 4,25rem e o recuo de 0,625rem, o item mede
 * 3rem e o ícone (1rem, com 1rem de cada lado) cai no centro. É o que deixa a
 * animação lisa — antes o item trocava de padding e de alinhamento de uma vez.
 */
const CLASSE_DO_ITEM =
  "flex h-10 items-center gap-3 overflow-hidden rounded-sm px-4 text-md transition-colors";

/** Rótulo que esmaece ao recolher. Continua no DOM: quem usa leitor de tela ouve o mesmo menu. */
function Rotulo({ recolhida, children }: { recolhida: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        "whitespace-nowrap transition-opacity duration-200",
        recolhida ? "opacity-0" : "opacity-100 delay-100",
      )}
    >
      {children}
    </span>
  );
}

/** Ação no padrão dos itens do menu (tema, sair), para o rodapé seguir o mesmo movimento. */
export function AcaoDaBarra({
  icon: Icone,
  label,
  recolhida,
  ...props
}: {
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  recolhida: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const botao = (
    <button
      type="button"
      {...props}
      className={cn(CLASSE_DO_ITEM, "w-full text-muted-foreground hover:bg-muted hover:text-foreground")}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <Rotulo recolhida={recolhida}>{label}</Rotulo>
    </button>
  );
  if (!recolhida) return botao;
  return (
    <Tooltip>
      <TooltipTrigger render={botao} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}

function ItemLink({
  item,
  ativo,
  recolhida,
  aoNavegar,
}: {
  item: ItemDeNavegacao;
  ativo: boolean;
  recolhida: boolean;
  aoNavegar?: () => void;
}) {
  const Icone = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={ativo ? "page" : undefined}
      onClick={aoNavegar}
      className={cn(
        CLASSE_DO_ITEM,
        ativo
          ? "bg-primary-soft font-medium text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icone className="size-4 shrink-0" aria-hidden />
      <Rotulo recolhida={recolhida}>{item.label}</Rotulo>
    </Link>
  );

  if (!recolhida) return link;

  // O tooltip do Base UI abre no foco, não só no ponteiro (WCAG 1.4.13) — é o
  // que torna o trilho utilizável por teclado.
  return (
    <Tooltip>
      <TooltipTrigger render={link} />
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

function Grupo({
  grupo,
  ativo,
  recolhida,
  aoNavegar,
}: {
  grupo: GrupoDeNavegacao;
  ativo: string | null;
  recolhida: boolean;
  aoNavegar?: () => void;
}) {
  if (grupo.itens.length === 0) return null;
  const idDoTitulo = `grupo-${grupo.id}`;
  return (
    <nav aria-labelledby={idDoTitulo} className="flex flex-col gap-1">
      {/* O título esmaece sem sair do lugar: nada pula na vertical ao recolher,
          e o agrupamento continua existindo para o leitor de tela. */}
      <h2
        id={idDoTitulo}
        className={cn(
          "eyebrow whitespace-nowrap px-4 pt-3 pb-0.5 transition-opacity duration-200",
          recolhida ? "opacity-0" : "opacity-100 delay-100",
        )}
      >
        {grupo.label}
      </h2>
      {grupo.itens.map((item) => (
        <ItemLink
          key={item.href}
          item={item}
          ativo={ativo === item.href}
          recolhida={recolhida}
          aoNavegar={aoNavegar}
        />
      ))}
    </nav>
  );
}

export function SidebarToggle({ className }: { className?: string }) {
  const { aberta, alternar } = useSidebar();
  return (
    <button
      type="button"
      onClick={alternar}
      aria-expanded={aberta}
      aria-controls="navegacao-principal"
      title={aberta ? "Recolher a navegação (Ctrl+B)" : "Expandir a navegação (Ctrl+B)"}
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <PanelLeft className="size-4" aria-hidden />
      <span className="sr-only">{aberta ? "Recolher a navegação" : "Expandir a navegação"}</span>
    </button>
  );
}

/* Marca completa: faixa e gaveta do celular. */
function Wordmark() {
  return <Logo />;
}

/*
 * Cabeçalho da barra ao lado. O escudo fica no mesmo x dos ícones nos dois
 * estados. Recolhida, o próprio escudo é o botão de expandir: ao passar o mouse
 * (ou com foco do teclado) ele dá lugar ao ícone do painel. Aberta, o botão de
 * recolher aparece à direita quando o mouse está no cabeçalho.
 */
function CabecalhoDaBarra() {
  const { aberta, alternar } = useSidebar();
  return (
    <div className="group/cabeca mb-3 flex h-10 items-center gap-2.5 px-2">
      {aberta ? (
        <Logo variante="simbolo" className="size-8 shrink-0" />
      ) : (
        <button
          type="button"
          onClick={alternar}
          aria-expanded={false}
          aria-controls="navegacao-principal"
          title="Expandir a navegação (Ctrl+B)"
          className="group/marca relative grid size-8 shrink-0 place-items-center rounded-sm transition-colors hover:bg-muted focus-visible:bg-muted"
        >
          <Logo
            variante="simbolo"
            className="size-8 transition-opacity duration-150 group-hover/marca:opacity-0 group-focus-visible/marca:opacity-0"
          />
          <PanelLeft
            className="absolute size-4 text-foreground opacity-0 transition-opacity duration-150 group-hover/marca:opacity-100 group-focus-visible/marca:opacity-100"
            aria-hidden
          />
          <span className="sr-only">Expandir a navegação</span>
        </button>
      )}
      <NomeDaMarca
        className={cn(
          "whitespace-nowrap transition-opacity duration-200",
          aberta ? "opacity-100 delay-100" : "opacity-0",
        )}
      />
      <SidebarToggle
        className={cn(
          "ml-auto opacity-0 transition-opacity duration-150 group-hover/cabeca:opacity-100 focus-visible:opacity-100",
          !aberta && "invisible",
        )}
      />
    </div>
  );
}

export function Sidebar({
  solto,
  grupos,
  permitido,
  rodape,
}: {
  /** Item sem grupo, no topo. */
  solto?: ItemDeNavegacao;
  grupos: GrupoDeNavegacao[];
  /** Esconder é cortesia de interface — quem autoriza é o servidor. */
  permitido?: (permission: string) => boolean;
  rodape: (recolhida: boolean) => ReactNode;
}) {
  const pathname = usePathname();
  const { aberta, sobreposta, abrirSobreposta, fecharSobreposta } = useSidebar();
  const gatilho = useRef<HTMLButtonElement>(null);
  const estavaAberta = useRef(false);

  /*
   * Fechar devolve o foco a quem abriu. Desmontar o diálogo em vez de animá-lo
   * para fora custa isto: o Base UI não chega a restaurar o foco sozinho, e
   * sem restaurar, quem navega por teclado volta para o começo da página.
   *
   * Num efeito, e não dentro do `fechar`: ler `ref.current` num callback
   * montado durante o render é o que a regra `react-hooks/refs` proíbe.
   */
  useEffect(() => {
    if (estavaAberta.current && !sobreposta) gatilho.current?.focus();
    estavaAberta.current = sobreposta;
  }, [sobreposta]);

  // Grupo que perdeu todos os itens some inteiro, cabeçalho junto: título de
  // seção vazia é promessa de que existe algo ali.
  const visiveis = useMemo(
    () =>
      grupos
        .map((grupo) => ({
          ...grupo,
          itens: grupo.itens.filter((item) => !item.permission || !permitido || permitido(item.permission)),
        }))
        .filter((grupo) => grupo.itens.length > 0),
    [grupos, permitido],
  );

  const todos = useMemo(
    () => [...(solto ? [solto] : []), ...visiveis.flatMap((g) => g.itens)],
    [solto, visiveis],
  );
  const ativo = hrefAtivo(pathname, todos);

  const miolo = (recolhida: boolean, aoNavegar?: () => void) => (
    <>
      {solto && (
        <div className="flex flex-col gap-1">
          <ItemLink
            item={solto}
            ativo={ativo === solto.href}
            recolhida={recolhida}
            aoNavegar={aoNavegar}
          />
        </div>
      )}
      {visiveis.map((grupo) => (
        <Grupo
          key={grupo.id}
          grupo={grupo}
          ativo={ativo}
          recolhida={recolhida}
          aoNavegar={aoNavegar}
        />
      ))}
    </>
  );

  return (
    <TooltipProvider>
      {/*
        Lado a lado a partir de 75rem — 1200px com a fonte no padrão, e 1800px
        para quem a configurou em 24. O ponto de quebra é em rem porque a razão
        de a barra recolher é NÃO CABER: com a fonte maior ela deixa de caber
        antes, e um `1200px` fixo a manteria espremida justamente para quem
        mais precisa de espaço.
      */}
      <aside
        id="navegacao-principal"
        // Nomeado para virar um marco anunciável: `<aside>` sem nome é uma
        // região sem identidade, e esta é a navegação inteira do painel.
        aria-label="Seções do painel"
        className={cn(
          "vidro hidden shrink-0 flex-col gap-1 border-glass-border px-2.5 py-5",
          "transition-[width] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
          // Trilho flutuante, como no Figma: descolado das bordas, cantos arredondados.
          "min-[75rem]:flex min-[75rem]:m-3 min-[75rem]:mr-0 min-[75rem]:rounded-lg min-[75rem]:border min-[75rem]:shadow-[var(--shadow-dialog)]",
          /*
           * Presa e com rolagem própria: treze itens mais três títulos passam
           * da altura de uma tela de 768px, e o rodapé (com o Sair) não pode
           * depender de rolar a página inteira para aparecer. Quem rola com o
           * corpo é o `<main>`, de que dependem as barras `sticky` das telas —
           * menos na visão de quadro das demandas, que tem altura de tela e
           * rola por dentro.
           *
           * `overflow-x-hidden` se escreve, e não se subentende: o Tailwind
           * emite um eixo só, e com o outro computando para `auto` o trilho
           * recolhido ganhava uma SEGUNDA barra, lateral. A causa era de
           * largura — a barra vertical comia 10px da caixa e o link de 2,5rem
           * não encolhe —, e está resolvida no `px-0` abaixo; isto aqui é o que
           * impede que um pixel de sobra futuro (anel, sombra, rótulo comprido
           * no estado aberto) traga a barra de volta. Não recorta menu nem
           * dica: o Base UI os manda por portal.
           */
          "min-[75rem]:sticky min-[75rem]:top-3 min-[75rem]:h-[calc(100dvh-1.5rem)] min-[75rem]:overflow-y-auto min-[75rem]:overflow-x-hidden",
          /*
           * Recolhida sem recuo horizontal: a caixa de conteúdo tem os 3,5rem
           * inteiros, e o link de 2,5rem cabe com folga para a barra vertical
           * ao lado. Com `px-2` a conta não fechava — 2,5rem de link em 2,5rem
           * de caixa, zero de sobra. O recuo visual continua o mesmo, porque
           * quem o produz é a diferença entre a largura do trilho e a do link.
           */
          aberta ? "w-64" : "w-[4.25rem]",
        )}
      >
        <CabecalhoDaBarra />

        <div className="flex flex-col gap-1">{miolo(!aberta)}</div>

        <div className="mt-auto w-full border-t border-border pt-3">{rodape(!aberta)}</div>
      </aside>

      {/* Abaixo de 1200px não cabe ao lado: uma faixa com o wordmark e um botão
          que abre a mesma navegação por cima da tela. O `ui/dialog` dá prisão
          de foco, `aria-modal` e Escape sem uma linha a mais. */}
      <div
        className={cn(
          // `vidro`, e não `bg-card`: o cartão é branco a 2%, pensado para
          // repousar SOBRE o fundo. Numa barra grudada no topo isso deixava o
          // conteúdo passar por baixo e ser lido através dela.
          "vidro sticky top-0 z-40 flex items-center gap-2 border-b border-border px-4 py-2.5",
          "min-[75rem]:hidden",
        )}
      >
        <button
          ref={gatilho}
          type="button"
          onClick={abrirSobreposta}
          aria-expanded={sobreposta}
          aria-controls="navegacao-sobreposta"
          className="grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <PanelLeft className="size-4" aria-hidden />
          <span className="sr-only">Abrir a navegação</span>
        </button>
        <Wordmark />
      </div>

      {/*
        Renderizado só enquanto aberto, e com `open` fixo — é o padrão que
        `demandas/detalhe.tsx` já usa. Não é preferência: mantendo o
        `<Dialog>` montado e alternando `open`, o Base UI marca a superfície
        com `data-closed` e espera a animação de saída terminar para
        desmontá-la; com o `transition-duration` que o `DialogContent` deixa
        no `transition-property: all` do padrão, essa espera não termina e a
        navegação fica presa na tela, sem responder a Escape nem ao botão de
        fechar. O preço é não ter animação de saída, e o foco volta ao
        gatilho na mão, no efeito acima.
      */}
      {sobreposta && (
        <Dialog open onOpenChange={(aberto) => !aberto && fecharSobreposta()}>
          <DialogContent
            id="navegacao-sobreposta"
            showCloseButton={false}
            className="top-0 left-0 h-dvh w-[18rem] max-w-[85%] translate-x-0 translate-y-0 flex-col gap-1 overflow-y-auto rounded-none border-y-0 border-l-0 px-3.5 py-5 sm:max-w-[18rem] data-open:slide-in-from-left data-open:zoom-in-100"
          >
            <div className="flex items-center justify-between px-2.5 pb-4">
              <DialogTitle className="sr-only">Navegação</DialogTitle>
              <Wordmark />
              <button
                type="button"
                onClick={fecharSobreposta}
                className="grid size-8 shrink-0 place-items-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
                <span className="sr-only">Fechar a navegação</span>
              </button>
            </div>

            {/* Sempre com rótulo: numa sobreposição há espaço, e o trilho de
                ícones é escolha de quem tem a barra ao lado. Navegar fecha. */}
            <div className="flex flex-col gap-1">{miolo(false, fecharSobreposta)}</div>

            <div className="mt-auto w-full border-t border-border pt-4">{rodape(false)}</div>
          </DialogContent>
        </Dialog>
      )}
    </TooltipProvider>
  );
}
