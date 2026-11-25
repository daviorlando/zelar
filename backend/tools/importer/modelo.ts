// Gera a planilha-modelo (exemplos/ecogesso/modelo-planilha.xlsx) no layout que parse.ts lê.
// Todas as linhas são fictícias, só para mostrar o formato. Apague-as e preencha com os dados da empresa.
import ExcelJS from "exceljs";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";

const saida = resolve(process.argv[2] ?? "../exemplos/ecogesso/modelo-planilha.xlsx");

const wb = new ExcelJS.Workbook();

const setor = wb.addWorksheet("Setor A");
setor.addRow(["MODELO — Setor A (dados fictícios; apague e preencha)"]);
setor.addRow([]);
setor.addRow(["MENSAIS"]);
setor.addRow(["Equipamento", "Componente", "Tag", "Atividade"]);
setor.addRow(["EXEMPLO FICTÍCIO — Exaustor", "Motor", "A - EX01 - ME", "Inspeção visual: conferir fixação e ruídos anormais"]);
setor.addRow([null, "Rolamento", "A - EX01 - RD", "Lubrificação: aplicar graxa conforme o manual"]);
setor.addRow([]);
setor.addRow(["SEMESTRAL"]);
setor.addRow(["Equipamento", "Componente", "Tag", "Atividade"]);
setor.addRow(["EXEMPLO FICTÍCIO — Exaustor", "Motor", "A - EX01 - ME", "Medição: registrar a corrente elétrica"]);
setor.columns = [{ width: 32 }, { width: 18 }, { width: 18 }, { width: 70 }];

const lista = wb.addWorksheet("Lista de Equipamentos por setor");
lista.addRow(["Sigla", "Nome", "Marca", "Modelo", "Potência (CV)", "RPM", "Temperatura de trabalho", "Lubrificante"]);
lista.addRow(["SETOR A"]);
lista.addRow(["A - EX01 - ME", "Motor do exaustor (EXEMPLO FICTÍCIO)", "Marca Fictícia", "MF-100", 5, 1750, "até 80 °C", "Graxa de lítio"]);
lista.addRow(["A - EX01 - RD", "Rolamento do exaustor (EXEMPLO FICTÍCIO)", "Marca Fictícia", "RF-6205"]);
lista.columns = [{ width: 18 }, { width: 40 }, { width: 18 }, { width: 14 }, { width: 14 }, { width: 8 }, { width: 24 }, { width: 18 }];

mkdirSync(dirname(saida), { recursive: true });
await wb.xlsx.writeFile(saida);
console.log(`Modelo gravado em ${saida}`);
