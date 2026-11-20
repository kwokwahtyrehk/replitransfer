// Explicit allowlist: never export sessions, password hashes, or arbitrary tables.
export const businessTables = [
  "inventory_items", "invoices", "invoice_items", "inventory_dot_units",
  "supplier_directory", "supply_items", "supply_item_suppliers",
  "expenses", "expense_settings", "order_store",
] as const;

type ExportClient = {
  query: (sql: string) => Promise<{ rows: any[] }>;
};

export async function buildDataExport(client: ExportClient) {
  await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
  try {
    const tables: Record<string, unknown[]> = {};
    for (const table of businessTables) {
      tables[table] = (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
    }
    tables.user_profiles = (await client.query(
      'SELECT id, username, display_name, created_at, updated_at FROM users ORDER BY id',
    )).rows;
    // These optional integration tables are not installed in every instance.
    const optional = (await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('conversations', 'messages')",
    )).rows.map((row) => row.table_name);
    for (const table of ["conversations", "messages"]) {
      if (optional.includes(table)) {
        tables[table] = (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows;
      }
    }
    await client.query("COMMIT");
    return {
      format: "tyrepro-business-data",
      version: 1,
      exportedAt: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(tables).map(([key, rows]) => [key, rows.length])),
      tables,
      migrationNotes: [
        "Private business data: do not upload this file to public GitHub.",
        "This is a migration export, not an input to Invoice Restore or Inventory Import.",
        "Base44 needs matching entities and a custom JSON import or conversion into per-table CSVs.",
        "Preserve original IDs as legacy IDs and map foreign keys to new destination IDs.",
        "Import inventory and invoices before invoice_items, then inventory_dot_units.",
        "Import supplier_directory and supply_items before supply_item_suppliers.",
        "Do not regenerate invoice numbers, recalculate historical totals, or deduct stock again during import.",
        "order_store.data is a JSON-encoded document containing all saved customer tabs and orders.",
        "User profiles exclude passwords. Recreate authentication accounts in the destination.",
        "Sessions, credentials, environment secrets, source code and Git history are excluded.",
        "Browser settings and potentially newer local orders are included separately by the download button.",
      ],
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}
