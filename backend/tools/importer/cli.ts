// Importador da planilha "Calendário de Manutenção" — modo simulação.
// Uso: npm run import:dry -- <planilha.xlsx> [pasta-de-saída]
// Gera relatorio-conferencia.xlsx (para revisão humana) e importacao.json (entrada da carga no banco).
// Nada é gravado no banco nesta etapa.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseWorkbook } from "./parse";
import { specDivergences, summary, writeReport } from "./report";

async function main() {
  const [input, outDir = join(import.meta.dirname, "out")] = process.argv.slice(2);
  if (!input) {
    console.error("Uso: npm run import:dry -- <planilha.xlsx> [pasta-de-saída]");
    process.exit(1);
  }
  const result = await parseWorkbook(input);
  const divergences = specDivergences(result);
  await mkdir(outDir, { recursive: true });
  const { pending } = await writeReport(join(outDir, "relatorio-conferencia.xlsx"), result, divergences);
  await writeFile(join(outDir, "importacao.json"), JSON.stringify({ generatedAt: new Date().toISOString(), ...result, divergences }, null, 2));

  const s = summary(result.rows);
  console.table([...s.table, { sector: "Total", ...s.totals }]);
  console.log(`Cadastro: ${result.catalog.length} tags | Tipos de instrução: ${new Set(result.rows.map((r) => r.instructionKind)).size}`);
  console.log(`Linhas com pendência: ${result.rows.filter((r) => r.issues.length).length} | Itens no relatório de pendências: ${pending}`);
  console.log(`Saída: ${outDir}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
