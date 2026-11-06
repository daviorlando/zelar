// Carga da planilha no banco. Uso: npm run import:load -- <planilha.xlsx> --company=<id da empresa>
// Idempotente: equipamentos por tag, atividades por (aba, linha), dentro da empresa.
// Atividades diárias entram retiradas: o plano não tem mais revisão diária.
// Linhas com pendência (tag em branco, inexistente ou de outro setor) ficam fora do plano (retired)
// e são listadas no fim: corrija a tag na planilha e importe de novo.
// O que o gestor já mexeu no painel (equipment.edited_at, plan_item.reviewed_at) não é sobrescrito.
import { connect } from "../db/client";
import { parseWorkbook } from "./parse";

async function main() {
  const args = process.argv.slice(2);
  const input = args.find((a) => !a.startsWith("--"));
  const company = args.find((a) => a.startsWith("--company="))?.slice("--company=".length);
  if (!input || !company) {
    console.error("Uso: npm run import:load -- <planilha.xlsx> --company=<id da empresa>");
    process.exit(1);
  }
  const { rows, catalog } = await parseWorkbook(input);
  const db = await connect();
  try {
    const { rowCount: existe } = await db.query("select 1 from public.company where id = $1", [company]);
    if (!existe) throw new Error(`Empresa não encontrada: ${company}`);
    await db.query("begin");

    const sectors = [...new Set([...catalog.map((e) => e.sector), ...rows.map((r) => r.sector)])].filter((s) => /^[A-Z]$/.test(s)).sort();
    await db.query(
      "insert into public.sector (company_id, code, name) select $2, s, 'Setor ' || s from unnest($1::text[]) s on conflict (company_id, code) do nothing",
      [sectors, company],
    );

    // Principais antes dos componentes, para o parent_id já existir.
    const equipment = [...catalog].sort((a, b) => Number(a.parentTag != null) - Number(b.parentTag != null));
    await db.query(
      `insert into public.equipment (company_id, tag, name, parent_id, sector_code, brand, model, power_cv, rpm, working_temp, lubricant, source_row)
       select $2::uuid, e.tag, e.name, p.id, e.sector, e.brand, e.model, e."powerCv", e.rpm, e."workingTemp", e.lubricant, e.row
       from jsonb_to_recordset($1::jsonb) as e(tag text, name text, "parentTag" text, sector text, brand text, model text,
            "powerCv" numeric, rpm numeric, "workingTemp" text, lubricant text, row int)
       left join public.equipment p on p.tag = e."parentTag" and p.company_id = $2
       where e."parentTag" is null
       on conflict (company_id, tag) do update set name = excluded.name, sector_code = excluded.sector_code, brand = excluded.brand,
         model = excluded.model, power_cv = excluded.power_cv, rpm = excluded.rpm, working_temp = excluded.working_temp,
         lubricant = excluded.lubricant, source_row = excluded.source_row
       where equipment.edited_at is null`,
      [JSON.stringify(equipment.map((e) => ({ ...e, row: e.source.row }))), company],
    );
    await db.query(
      `insert into public.equipment (company_id, tag, name, parent_id, sector_code, brand, model, power_cv, rpm, working_temp, lubricant, source_row)
       select $2::uuid, e.tag, e.name, p.id, e.sector, e.brand, e.model, e."powerCv", e.rpm, e."workingTemp", e.lubricant, e.row
       from jsonb_to_recordset($1::jsonb) as e(tag text, name text, "parentTag" text, sector text, brand text, model text,
            "powerCv" numeric, rpm numeric, "workingTemp" text, lubricant text, row int)
       join public.equipment p on p.tag = e."parentTag" and p.company_id = $2
       on conflict (company_id, tag) do update set name = excluded.name, parent_id = excluded.parent_id, sector_code = excluded.sector_code,
         brand = excluded.brand, model = excluded.model, power_cv = excluded.power_cv, rpm = excluded.rpm,
         working_temp = excluded.working_temp, lubricant = excluded.lubricant, source_row = excluded.source_row
       where equipment.edited_at is null`,
      [JSON.stringify(equipment.filter((e) => e.parentTag).map((e) => ({ ...e, row: e.source.row }))), company],
    );

    const items = rows.map((r) => ({
      sheet: r.source.sheet,
      row: r.source.row,
      sector: r.sector,
      frequency: r.frequency,
      tag: r.tag,
      equipmentName: r.equipmentName,
      componentName: r.componentName,
      tagRaw: r.tagOriginal,
      activity: r.activity,
      kind: r.instructionKind,
      type: r.suggestedType,
      qualification: r.suggestedQualification,
      multiple: r.multipleActions,
      issues: r.issues,
    }));
    const { rows: counts } = await db.query(
      `with src as (
         select i.*, e.id as equipment_id
         from jsonb_to_recordset($1::jsonb) as i(sheet text, row int, sector text, frequency public.frequency, tag text,
              "equipmentName" text, "componentName" text, "tagRaw" text, activity text, kind text, type public.item_type,
              qualification text, multiple boolean, issues text[])
         left join public.equipment e on e.tag = i.tag and e.company_id = $2
       ), up as (
         insert into public.plan_item (company_id, source_sheet, source_row, sector_code, frequency, equipment_id, equipment_name_raw,
           component_name_raw, tag_raw, activity, instruction_kind, item_type, qualification, multiple_actions, status, issues)
         select $2::uuid, sheet, row, sector, frequency, equipment_id, "equipmentName", "componentName", "tagRaw", activity, kind, type,
           qualification, multiple,
           case when frequency = 'daily' or cardinality(issues) > 0 or equipment_id is null then 'retired' else 'active' end::public.plan_status,
           issues
         from src
         on conflict (company_id, source_sheet, source_row) do update set
           sector_code = excluded.sector_code, frequency = excluded.frequency, equipment_name_raw = excluded.equipment_name_raw,
           component_name_raw = excluded.component_name_raw, tag_raw = excluded.tag_raw, activity = excluded.activity,
           instruction_kind = excluded.instruction_kind, multiple_actions = excluded.multiple_actions,
           equipment_id = excluded.equipment_id, item_type = excluded.item_type, qualification = excluded.qualification,
           status = excluded.status, issues = excluded.issues
         where plan_item.reviewed_at is null
         returning (xmax = 0) as inserted, status, reviewed_at, source_sheet, source_row, frequency
       )
       select count(*) filter (where inserted) as novas, count(*) filter (where not inserted) as atualizadas,
              array_agg(source_sheet || ' linha ' || source_row order by source_sheet, source_row)
                filter (where status = 'retired' and reviewed_at is null and frequency <> 'daily') as ignoradas
       from up`,
      [JSON.stringify(items), company],
    );

    // Linhas que saíram da planilha deixam de valer (sem apagar o histórico das ordens já geradas).
    const sheets = [...new Set(rows.map((r) => r.source.sheet))];
    const { rowCount: retired } = await db.query(
      `update public.plan_item set status = 'retired'
       where company_id = $4 and source_sheet = any($1::text[]) and status <> 'retired' and reviewed_at is null
         and (source_sheet, source_row) not in (select s, r from unnest($2::text[], $3::int[]) as t(s, r))`,
      [sheets, rows.map((r) => r.source.sheet), rows.map((r) => r.source.row), company],
    );

    await db.query("commit");
    const c = counts[0];
    console.log(`Setores: ${sectors.join(", ")} | Equipamentos e componentes: ${catalog.length}`);
    console.log(`Atividades: ${rows.length} (novas ${c.novas}, atualizadas ${c.atualizadas}, retiradas da planilha ${retired})`);
    const ignoradas: string[] = c.ignoradas ?? [];
    if (ignoradas.length) {
      console.log(`Ignoradas por falta de equipamento (${ignoradas.length}): corrija a tag na planilha e importe de novo.`);
      for (const l of ignoradas) console.log(`  ${l}`);
    }
  } catch (err) {
    await db.query("rollback");
    throw err;
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
