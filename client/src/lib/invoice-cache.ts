import type { QueryClient } from "@tanstack/react-query";
import type { InvoiceWithItems } from "@shared/schema";

// Only publish a server-confirmed invoice. Cancel older list reads so they
// cannot hide the newly saved invoice while the reconciliation request runs.
export async function publishCreatedInvoice(client: QueryClient, invoice: InvoiceWithItems) {
  await client.cancelQueries({ queryKey: ["/api/invoices"], exact: true });
  client.setQueryData<InvoiceWithItems[]>(["/api/invoices"], (existing) =>
    existing ? [invoice, ...existing.filter((entry) => entry.id !== invoice.id)] : undefined,
  );
  void client.invalidateQueries({ queryKey: ["/api/invoices"] });
  void client.invalidateQueries({ queryKey: ["/api/inventory"] });
  // Refresh a cached dashboard now, even when the user is still on Invoices.
  // This avoids starting the totals request only after navigation.
  void client.invalidateQueries({ queryKey: ["/api/stats"], refetchType: "all" });
}
