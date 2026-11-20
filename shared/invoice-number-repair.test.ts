import { strict as assert } from "node:assert";
import { test } from "node:test";
import { invoiceNumberRepairSchema } from "./invoice-number-repair";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("accepts up to 10 unique invoice numbers and trims surrounding whitespace", () => {
  const result = invoiceNumberRepairSchema.parse({
    changes: Array.from({ length: 10 }, (_, index) => ({ id: id(index), invoiceNumber: ` KW-${index} ` })),
  });
  assert.equal(result.changes.length, 10);
  assert.equal(result.changes[0].invoiceNumber, "KW-0");
});
test("rejects empty batches and selecting more than 10", () => {
  assert.equal(invoiceNumberRepairSchema.safeParse({ changes: [] }).success, false);
  assert.equal(invoiceNumberRepairSchema.safeParse({
    changes: Array.from({ length: 11 }, (_, index) => ({ id: id(index), invoiceNumber: `KW-${index}` })),
  }).success, false);
});
test("rejects blank names, duplicate final numbers and duplicate invoice IDs", () => {
  for (const changes of [
    [{ id: id(1), invoiceNumber: "  " }],
    [{ id: id(1), invoiceNumber: "KW-1" }, { id: id(2), invoiceNumber: " KW-1 " }],
    [{ id: id(1), invoiceNumber: "KW-1" }, { id: id(1), invoiceNumber: "KW-2" }],
  ]) {
    assert.equal(invoiceNumberRepairSchema.safeParse({ changes }).success, false);
  }
});
test("accepts final numbers in a swap without imposing a numbering format", () => {
  assert.equal(invoiceNumberRepairSchema.safeParse({
    changes: [{ id: id(1), invoiceNumber: "41705" }, { id: id(2), invoiceNumber: "KW2610-41704" }],
  }).success, true);
});
