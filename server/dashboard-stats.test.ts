import { strict as assert } from "node:assert";
import { test } from "node:test";
import { getDashboardStats } from "./dashboard-stats";
import { storage } from "./storage";
import { pool } from "./db";

test("aggregate dashboard query preserves existing totals and deposit exclusion", async () => {
  try {
    for (const now of [new Date(), new Date(2026, 11, 15)]) {
      const [products, invoices] = await Promise.all([
        storage.getInventoryItems(), storage.getInvoices(),
      ]);
      const expected = {
        totalInventory: products.reduce((sum, item) => sum + item.quantity, 0),
        lowStockItems: products.filter((item) => item.quantity <= 10).length,
        pendingInvoices: invoices.filter((invoice) => invoice.status === "pending").length,
        monthlySales: invoices.filter((invoice) => {
          const date = new Date(invoice.invoiceDate || invoice.createdAt);
          return date.getMonth() === now.getMonth() &&
            date.getFullYear() === now.getFullYear() &&
            parseFloat(invoice.deposit || "0") === 0;
        }).reduce((sum, invoice) => sum + parseFloat(invoice.totalAmount), 0).toFixed(2),
      };
      assert.deepEqual(await getDashboardStats(now), expected);
    }
  } finally {
    await pool.end();
  }
});
