import { strict as assert } from "node:assert";
import { test } from "node:test";
import { QueryClient } from "@tanstack/react-query";
import type { InvoiceWithItems } from "../../../shared/schema";
import { publishCreatedInvoice } from "./invoice-cache";

const invoice = (id: string) => ({ id, invoiceNumber: `TEST-${id}`, items: [] }) as unknown as InvoiceWithItems;

test("server-confirmed invoice is visible before the slow list refresh resolves", async () => {
  const client = new QueryClient();
  const existing = invoice("existing");
  const created = invoice("new");
  client.setQueryData(["/api/invoices"], [existing]);
  await publishCreatedInvoice(client, created);
  assert.deepEqual(client.getQueryData(["/api/invoices"]), [created, existing]);
  await publishCreatedInvoice(client, created);
  assert.deepEqual(client.getQueryData(["/api/invoices"]), [created, existing]);
  assert.equal(client.getQueryState(["/api/invoices"])?.isInvalidated, true);
  client.clear();
});

test("does not seed an incomplete list if the full invoice list was never loaded", async () => {
  const client = new QueryClient();
  await publishCreatedInvoice(client, invoice("new"));
  assert.equal(client.getQueryData(["/api/invoices"]), undefined);
  client.clear();
});

test("cancels stale in-flight list reads and starts refreshing the inactive dashboard immediately", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const existing = invoice("existing");
  const created = invoice("new");
  client.setQueryData(["/api/invoices"], [existing]);
  let resolveOldRequest!: (data: InvoiceWithItems[]) => void;
  const oldRequest = client.fetchQuery({
    queryKey: ["/api/invoices"],
    queryFn: () => new Promise<InvoiceWithItems[]>((resolve) => { resolveOldRequest = resolve; }),
  }).catch(() => undefined);
  let dashboardRequests = 0;
  await client.fetchQuery({
    queryKey: ["/api/stats"],
    queryFn: async () => ({ pendingInvoices: ++dashboardRequests }),
  });
  await publishCreatedInvoice(client, created);
  resolveOldRequest([existing]);
  await oldRequest;
  assert.deepEqual(client.getQueryData(["/api/invoices"]), [created, existing]);
  assert.equal(dashboardRequests, 2);
  client.clear();
});
