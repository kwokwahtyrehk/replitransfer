import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { queryClient } from "@/lib/queryClient";
import { apiRequest } from "@/lib/queryClient";
import { insertInvoiceSchema, type InventoryItem } from "@shared/schema";
import InvoiceItemForm from "./invoice-item-form";

const invoiceItemSchema = z.object({
  productName: z.string().min(1, "Product is required"),
  size: z.string().min(1, "Size is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  price: z.number().min(0.01, "Price must be greater than 0"),
  remark: z.string().optional(),
});

const createInvoiceFormSchema = insertInvoiceSchema.extend({
  items: z.array(invoiceItemSchema).min(1, "At least one item is required"),
});

type CreateInvoiceForm = z.infer<typeof createInvoiceFormSchema>;

interface InvoiceFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export default function InvoiceForm({ onSuccess, onCancel }: InvoiceFormProps) {
  const { toast } = useToast();

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const form = useForm<CreateInvoiceForm>({
    resolver: zodResolver(createInvoiceFormSchema),
    defaultValues: {
      customerName: "",
      customerEmail: "",
      status: "pending",
      items: [{ productName: "", size: "", quantity: 1, price: 0, remark: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = form.watch("items");
  const totalAmount = watchedItems.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  const mutation = useMutation({
    mutationFn: async (data: CreateInvoiceForm) => {
      const { items, ...invoiceData } = data;
      const response = await apiRequest("POST", "/api/invoices", {
        invoice: invoiceData,
        items: items,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Invoice created successfully",
      });
      onSuccess();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create invoice",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: CreateInvoiceForm) => {
    mutation.mutate(data);
  };

  const addItem = () => {
    append({ productName: "", size: "", quantity: 1, price: 0, remark: "" });
  };

  const removeItem = (index: number) => {
    if (fields.length > 1) {
      remove(index);
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" data-testid="invoice-form">
        {/* Customer Information */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="customerName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Name</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Enter customer name"
                    {...field}
                    data-testid="input-customer-name"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          
          <FormField
            control={form.control}
            name="customerEmail"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Customer Email</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="Enter customer email"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-customer-email"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {/* Invoice Items */}
        <div className="border border-border rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h5 className="font-medium text-foreground">Invoice Items</h5>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={addItem}
              data-testid="btn-add-item"
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Item
            </Button>
          </div>
          
          <div className="space-y-4">
            {fields.map((field, index) => (
              <InvoiceItemForm
                key={field.id}
                index={index}
                form={form}
                inventoryItems={inventoryItems}
                onRemove={() => removeItem(index)}
                canRemove={fields.length > 1}
              />
            ))}
          </div>
        </div>

        {/* Total and Actions */}
        <div className="flex justify-between items-center pt-4 border-t border-border">
          <div className="text-lg font-semibold text-foreground" data-testid="invoice-total">
            Total: ${totalAmount.toFixed(2)}
          </div>
          <div className="space-x-3">
            <Button 
              type="button" 
              variant="outline" 
              onClick={onCancel}
              data-testid="btn-cancel"
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={mutation.isPending}
              data-testid="btn-create-invoice"
            >
              {mutation.isPending ? "Creating..." : "Create Invoice"}
            </Button>
          </div>
        </div>
      </form>
    </Form>
  );
}
