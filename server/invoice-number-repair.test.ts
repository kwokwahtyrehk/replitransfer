import { strict as assert } from "node:assert";
import { test } from "node:test";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { db, pool } from "./db";
import { storage } from "./storage";
import { invoices, invoiceItems } from "../shared/schema";

test("number repairs swap atomically, reject conflicts, and leave invoice items intact", async () => {
  const token = `repair-test-${randomUUID()}`;
  const date = new Date().toISOString().slice(0, 10);
  const ids: string[] = [];
  try {
    const fixtures = await db.insert(invoices).values(
      ["A", "B", "C"].map((suffix) => ({
        invoiceNumber: `${token}-${suffix}`, invoiceDate: date,
        createdAt: date, updatedAt: date, totalAmount: "20.00",
      })),
    ).returning();
    ids.push(...fixtures.map((invoice) => invoice.id));
    const [item] = await db.insert(invoiceItems).values({
      invoiceId: ids[0], category: "others", productName: "Repair test item",
      quantity: 2, price: "10.00",
    }).returning();
    const numberA = fixtures[0].invoiceNumber;
    const numberB = fixtures[1].invoiceNumber;
    const numberC = fixtures[2].invoiceNumber;

    assert.equal(await storage.repairInvoiceNumbers([
      { id: ids[0], invoiceNumber: numberB },
      { id: ids[1], invoiceNumber: numberA },
    ]), 2);
    let actual = await db.select().from(invoices).where(inArray(invoices.id, ids));
    assert.equal(actual.find((invoice) => invoice.id === ids[0])?.invoiceNumber, numberB);
    assert.equal(actual.find((invoice) => invoice.id === ids[1])?.invoiceNumber, numberA);

    await assert.rejects(storage.repairInvoiceNumbers([
      { id: ids[0], invoiceNumber: `${token}-NEW` },
      { id: ids[1], invoiceNumber: numberC },
    ]), /already exists/);
    await assert.rejects(storage.repairInvoiceNumbers([
      { id: ids[0], invoiceNumber: `${token}-NEW` },
      { id: randomUUID(), invoiceNumber: `${token}-MISSING` },
    ]), /no longer exists/);
    actual = await db.select().from(invoices).where(inArray(invoices.id, ids));
    assert.equal(actual.find((invoice) => invoice.id === ids[0])?.invoiceNumber, numberB);
    assert.equal(actual.find((invoice) => invoice.id === ids[1])?.invoiceNumber, numberA);
    assert.equal(actual.find((invoice) => invoice.id === ids[0])?.totalAmount, "20.00");
    const [unchangedItem] = await db.select().from(invoiceItems).where(eq(invoiceItems.id, item.id));
    assert.deepEqual(unchangedItem, item);
  } finally {
    if (ids.length) await db.delete(invoices).where(inArray(invoices.id, ids));
    await pool.end();
  }
});
