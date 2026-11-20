import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDataExport, businessTables } from "./data-export";
import { assertNewInventoryProducts, parseInventoryCSV } from "../shared/inventory-import";

test("export uses a read-only snapshot, all business tables, and no password columns", async () => {
  const calls: string[] = [];
  const result = await buildDataExport({ async query(sql) {
    calls.push(sql);
    if (sql.includes("information_schema")) return { rows: [] };
    return { rows: sql.startsWith("SELECT") ? [{ id: "original-id", amount: "12.30" }] : [] };
  } });
  assert.match(calls[0], /REPEATABLE READ READ ONLY/);
  assert.equal(calls.at(-1), "COMMIT");
  for (const table of businessTables) {
    assert.equal(result.counts[table], 1);
    assert.deepEqual(result.tables[table][0], { id: "original-id", amount: "12.30" });
  }
  assert.ok(calls.some(sql => sql.startsWith("SELECT id, username, display_name")));
  assert.ok(!calls.some(sql => /password|SELECT \* FROM "users"|DELETE|INSERT|UPDATE/.test(sql)));
});

test("a partial export fails and rolls back rather than producing an incomplete backup", async () => {
  const calls: string[] = [];
  await assert.rejects(buildDataExport({ async query(sql) {
    calls.push(sql);
    if (sql.includes('"invoice_items"')) throw new Error("fixture failure");
    return { rows: [] };
  } }));
  assert.equal(calls.at(-1), "ROLLBACK");
  assert.ok(!calls.includes("COMMIT"));
});

test("inventory import refuses duplicates before any writes", () => {
  const tyre = { category: "tyres", brand: "Test", pattern: "Sport", size: "205/55R16" };
  assert.throws(() => assertNewInventoryProducts([tyre], [{ ...tyre, brand: " test " }]), /No products were imported/);
  assert.throws(() => assertNewInventoryProducts([], [tyre, tyre]), /No products were imported/);
  assert.doesNotThrow(() => assertNewInventoryProducts([tyre], [{ ...tyre, size: "225/45R17" }]));
});

test("CSV preserves quotes, commas, multiline remarks and leading zeros", () => {
  assert.deepEqual(parseInventoryCSV('\uFEFF"Name","Remark"\r\n"001","a ""quote"",\nnext line"\r\n'),
    [["Name", "Remark"], ["001", 'a "quote",\nnext line']]);
  assert.throws(() => parseInventoryCSV('"unclosed'), /unclosed/);
});
