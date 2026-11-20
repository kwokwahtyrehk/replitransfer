import { z } from "zod";

export const invoiceNumberRepairSchema = z.object({
  changes: z.array(z.object({
    id: z.string().uuid(),
    invoiceNumber: z.string().trim().min(1, "Invoice number is required")
      .max(100, "Invoice number must be at most 100 characters"),
  })).min(1, "Select at least one invoice").max(10, "Select at most 10 invoices"),
}).superRefine(({ changes }, ctx) => {
  const ids = new Set<string>();
  const numbers = new Set<string>();
  changes.forEach((change, index) => {
    if (ids.has(change.id)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Each invoice may only be selected once", path: ["changes", index, "id"] });
    }
    if (numbers.has(change.invoiceNumber)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Duplicate invoice number: ${change.invoiceNumber}`, path: ["changes", index, "invoiceNumber"] });
    }
    ids.add(change.id);
    numbers.add(change.invoiceNumber);
  });
});

export type InvoiceNumberChange = z.infer<typeof invoiceNumberRepairSchema>["changes"][number];

export class InvoiceNumberRepairError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}
