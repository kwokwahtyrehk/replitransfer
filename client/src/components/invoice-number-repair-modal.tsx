import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertCircle, Check, FileText, Search, X } from "lucide-react";
import type { InvoiceWithItems } from "@shared/schema";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface InvoiceNumberRepairModalProps {
  invoices: InvoiceWithItems[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function getApiErrorMessage(error: unknown) {
  if (!(error instanceof Error)) return "The invoice numbers could not be saved.";
  const responseText = error.message.replace(/^\d+:\s*/, "");
  try {
    const body = JSON.parse(responseText) as { message?: unknown };
    if (typeof body.message === "string" && body.message.trim()) return body.message;
  } catch {
    // The API may return plain text; show that response directly.
  }
  return responseText || "The invoice numbers could not be saved.";
}

export default function InvoiceNumberRepairModal({ invoices, open, onOpenChange }: InvoiceNumberRepairModalProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [draftNumbers, setDraftNumbers] = useState<Record<string, string>>({});
  const { toast } = useToast();

  const selectedInvoices = useMemo(
    () => selectedIds.map(id => invoices.find(invoice => invoice.id === id)).filter((invoice): invoice is InvoiceWithItems => Boolean(invoice)),
    [invoices, selectedIds],
  );
  const searchResults = useMemo(() => {
    const search = searchTerm.trim().toLocaleLowerCase();
    return invoices.filter(invoice =>
      !search ||
      invoice.invoiceNumber.toLocaleLowerCase().includes(search) ||
      (invoice.customerName || "").toLocaleLowerCase().includes(search) ||
      (invoice.carNo || "").toLocaleLowerCase().includes(search)
    ).slice(0, 100);
  }, [invoices, searchTerm]);

  const finalNumbers = selectedInvoices.map(invoice => ({
    id: invoice.id,
    value: (draftNumbers[invoice.id] ?? invoice.invoiceNumber).trim(),
  }));
  const conflictsById = new Map<string, string>();
  finalNumbers.forEach(({ id, value }) => {
    if (!value) conflictsById.set(id, "Enter an invoice number before saving.");
  });
  const groups = new Map<string, string[]>();
  finalNumbers.forEach(({ id, value }) => {
    if (!value) return;
    groups.set(value, [...(groups.get(value) || []), id]);
  });
  groups.forEach((ids, value) => {
    if (ids.length > 1) {
      ids.forEach(id => conflictsById.set(id, `“${value}” is used more than once. Give each selected invoice a unique number.`));
    }
    const outsideInvoice = invoices.find(invoice => !selectedIds.includes(invoice.id) && invoice.invoiceNumber.trim() === value);
    if (outsideInvoice) {
      ids.forEach(id => conflictsById.set(id, `“${value}” is already assigned to an invoice outside this selection. Choose another number.`));
    }
  });

  const changes = finalNumbers.filter(({ id, value }) => {
    const original = invoices.find(invoice => invoice.id === id)?.invoiceNumber.trim();
    return value !== original;
  });
  const saveMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("PUT", "/api/invoices/batch/repair-numbers", {
        changes: changes.map(({ id, value }) => ({ id, invoiceNumber: value })),
      });
      return response.json() as Promise<{ updatedCount: number }>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/follow-up"] });
      toast({
        title: "Invoice numbers repaired",
        description: `${result.updatedCount} invoice number${result.updatedCount === 1 ? "" : "s"} updated.`,
      });
      resetAndClose();
    },
  });

  function resetAndClose() {
    setSearchTerm("");
    setSelectedIds([]);
    setDraftNumbers({});
    saveMutation.reset();
    onOpenChange(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (saveMutation.isPending) return;
    if (nextOpen) onOpenChange(true);
    else resetAndClose();
  }

  function toggleInvoice(invoice: InvoiceWithItems, checked: boolean) {
    if (checked) {
      if (selectedIds.length >= 10) return;
      setSelectedIds(current => current.includes(invoice.id) ? current : [...current, invoice.id]);
      setDraftNumbers(current => ({ ...current, [invoice.id]: current[invoice.id] ?? invoice.invoiceNumber }));
    } else {
      setSelectedIds(current => current.filter(id => id !== invoice.id));
      setDraftNumbers(current => {
        const next = { ...current };
        delete next[invoice.id];
        return next;
      });
    }
    saveMutation.reset();
  }

  const errorMessage = saveMutation.error ? getApiErrorMessage(saveMutation.error) : "";
  const canSave = selectedInvoices.length > 0 &&
    changes.length > 0 &&
    conflictsById.size === 0 &&
    !saveMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90dvh] overflow-y-auto" data-testid="invoice-number-repair-modal">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Invoice # Repair
          </DialogTitle>
          <DialogDescription>
            Select up to 10 invoices and assign corrected numbers. Line items and prices are not changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <section className="space-y-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold">Find invoices</h3>
                <p className="text-xs text-muted-foreground">Search by invoice number, customer, or car number.</p>
              </div>
              <span className="shrink-0 rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums" data-testid="repair-selection-count">
                {selectedInvoices.length} / 10 selected
              </span>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={event => setSearchTerm(event.target.value)}
                className="pl-9"
                placeholder="Search invoices..."
                aria-label="Search invoices to repair"
                data-testid="input-repair-search"
              />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-md border">
              {searchResults.length ? searchResults.map(invoice => {
                const isSelected = selectedIds.includes(invoice.id);
                const atLimit = !isSelected && selectedIds.length >= 10;
                return (
                  <div
                    key={invoice.id}
                    className={`flex items-center gap-3 border-b p-3 last:border-b-0 ${isSelected ? "bg-primary/5" : "hover:bg-muted/50"} ${atLimit ? "opacity-50" : ""}`}
                    data-testid={`repair-option-${invoice.id}`}
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={atLimit || saveMutation.isPending}
                      onCheckedChange={checked => toggleInvoice(invoice, Boolean(checked))}
                      data-testid={`repair-select-${invoice.id}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-semibold">{invoice.invoiceNumber}</span>
                        <span className="text-sm text-foreground">{invoice.customerName || "No customer name"}</span>
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Car: {invoice.carNo || "Not provided"}</span>
                    </span>
                  </div>
                );
              }) : (
                <p className="p-4 text-center text-sm text-muted-foreground">No invoices match that search.</p>
              )}
            </div>
          </section>

          {selectedInvoices.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-end justify-between">
                <div>
                  <h3 className="text-sm font-semibold">Review number changes</h3>
                  <p className="text-xs text-muted-foreground">Final numbers must be unique across all invoices.</p>
                </div>
                <span className="text-xs text-muted-foreground">{changes.length} change{changes.length === 1 ? "" : "s"} ready</span>
              </div>
              <div className="space-y-2">
                {selectedInvoices.map(invoice => {
                  const issue = conflictsById.get(invoice.id);
                  const value = draftNumbers[invoice.id] ?? invoice.invoiceNumber;
                  return (
                    <div key={invoice.id} className="rounded-md border p-3" data-testid={`repair-row-${invoice.id}`}>
                      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.85fr)_auto] sm:items-center">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium">{invoice.customerName || "No customer name"}</div>
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            <span className="font-mono">Current: {invoice.invoiceNumber}</span>
                            <span className="mx-2">·</span>
                            Car: {invoice.carNo || "Not provided"}
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`repair-number-${invoice.id}`} className="mb-1 block text-xs font-medium text-muted-foreground">New invoice number</label>
                          <Input
                            id={`repair-number-${invoice.id}`}
                            value={value}
                            maxLength={100}
                            disabled={saveMutation.isPending}
                            onChange={event => {
                              setDraftNumbers(current => ({ ...current, [invoice.id]: event.target.value }));
                              saveMutation.reset();
                            }}
                            aria-invalid={Boolean(issue)}
                            aria-describedby={issue ? `repair-error-${invoice.id}` : undefined}
                            className={`font-mono ${issue ? "border-destructive focus-visible:ring-destructive" : ""}`}
                            data-testid={`input-repair-number-${invoice.id}`}
                          />
                          {issue && <p id={`repair-error-${invoice.id}`} className="mt-1 text-xs text-destructive">{issue}</p>}
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Remove ${invoice.invoiceNumber} from selection`}
                          disabled={saveMutation.isPending}
                          onClick={() => toggleInvoice(invoice, false)}
                          data-testid={`repair-remove-${invoice.id}`}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {errorMessage && (
            <Alert variant="destructive" data-testid="repair-server-error">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {errorMessage} Your selected invoices and edits are still here; review the numbers and try again.
              </AlertDescription>
            </Alert>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={resetAndClose} disabled={saveMutation.isPending} data-testid="btn-repair-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={!canSave}
            data-testid="btn-repair-save"
          >
            {saveMutation.isPending ? "Saving changes..." : <><Check className="mr-2 h-4 w-4" />Save number changes</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
