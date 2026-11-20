import { pool } from "./db";

export async function getDashboardStats(now = new Date()) {
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const monthEnd = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}-01`;

  // One small result instead of transferring every invoice, inventory product,
  // and physical DOT unit to Node just to compute four dashboard values.
  const { rows: [totals] } = await pool.query<{
    total_inventory: string;
    low_stock_items: string;
    monthly_sales: string;
    pending_invoices: string;
  }>(`
    SELECT stock.*, sales.*
    FROM (
      SELECT COALESCE(SUM(quantity), 0) AS total_inventory,
             COUNT(*) FILTER (WHERE quantity <= 10) AS low_stock_items
      FROM inventory_items
    ) stock
    CROSS JOIN (
      SELECT COALESCE(SUM(total_amount) FILTER (
               WHERE COALESCE(NULLIF(invoice_date, ''), created_at) >= $1
                 AND COALESCE(NULLIF(invoice_date, ''), created_at) < $2
                 AND COALESCE(deposit, 0) = 0
             ), 0) AS monthly_sales,
             COUNT(*) FILTER (WHERE status = 'pending') AS pending_invoices
      FROM invoices
    ) sales
  `, [monthStart, monthEnd]);
  return {
    totalInventory: Number(totals.total_inventory),
    monthlySales: Number(totals.monthly_sales).toFixed(2),
    lowStockItems: Number(totals.low_stock_items),
    pendingInvoices: Number(totals.pending_invoices),
  };
}
