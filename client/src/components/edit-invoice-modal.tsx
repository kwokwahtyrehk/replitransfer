import { useState, useEffect } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Minus, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { InvoiceWithItems, InventoryItem } from "@shared/schema";
import { getInvoiceProductName } from "@shared/invoice-product-name";
import { z } from "zod";

const editInvoiceFormSchema = z.object({
  invoiceNumber: z.string().min(1, "Invoice number is required"),
  invoiceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  customerName: z.string().nullable().optional(),
  carNo: z.string().nullable().optional(),
  remark: z.string().nullable().optional(),
  internalNotes: z.string().nullable().optional(),
  deposit: z.number().min(0).default(0),
  shipping: z.number().min(0).default(0),
  items: z.array(z.object({
    category: z.string(),
    brand: z.string().nullable().optional(),
    pattern: z.string().nullable().optional(),
    size: z.string().nullable().optional(),
    specialMarkings: z.string().nullable().optional(),
    model: z.string().nullable().optional(),
    pcd: z.string().nullable().optional(),
    color: z.string().nullable().optional(),
    productName: z.string().trim().min(1, "Product name is required"),
    quantity: z.number().min(1),
    price: z.number(), // Allow negative prices for discounts/credits
  })).min(1, "At least one item is required"),
});

type EditInvoiceForm = z.infer<typeof editInvoiceFormSchema>;

interface EditInvoiceModalProps {
  invoice: InvoiceWithItems | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function EditInvoiceModal({ invoice, isOpen, onClose }: EditInvoiceModalProps) {
  const { toast } = useToast();
  const [showDepositShipping, setShowDepositShipping] = useState(false);
  const [searchQueries, setSearchQueries] = useState<{ [key: number]: string }>({});
  const [showResults, setShowResults] = useState<{ [key: number]: boolean }>({});

  const { data: inventoryItems = [] } = useQuery<InventoryItem[]>({
    queryKey: ["/api/inventory"],
  });

  const form = useForm<EditInvoiceForm>({
    resolver: zodResolver(editInvoiceFormSchema),
    defaultValues: {
      invoiceNumber: "",
      invoiceDate: "",
      customerName: "",
      carNo: "",
      remark: "",
      internalNotes: "",
      deposit: 0,
      shipping: 0,
      items: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  // Populate form when invoice changes
  useEffect(() => {
    if (invoice && isOpen) {
      form.reset({
        invoiceNumber: invoice.invoiceNumber,
        invoiceDate: invoice.invoiceDate,
        customerName: invoice.customerName || "",
        carNo: invoice.carNo || "",
        remark: invoice.remark || "",
        internalNotes: invoice.internalNotes || "",
        deposit: parseFloat(invoice.deposit?.toString() || "0"),
        shipping: parseFloat(invoice.shipping?.toString() || "0"),
        items: invoice.items.map(item => ({
          category: item.category,
          brand: item.brand || "",
          pattern: item.pattern || "",
          size: item.size || "",
          specialMarkings: item.specialMarkings || "",
          model: item.model || "",
          pcd: item.pcd || "",
          color: item.color || "",
          productName: getInvoiceProductName(item),
          quantity: item.quantity,
          price: parseFloat(item.price),
        })),
      });
      setShowDepositShipping(
        parseFloat(invoice.deposit?.toString() || "0") > 0 || 
        parseFloat(invoice.shipping?.toString() || "0") > 0
      );
      setSearchQueries({});
      setShowResults({});
    }
  }, [invoice, isOpen, form]);

  const watchedItems = form.watch("items");
  const watchedDeposit = form.watch("deposit");
  const watchedShipping = form.watch("shipping");

  const subtotalAmount = watchedItems.reduce((sum, item) => {
    return sum + (item.price * item.quantity);
  }, 0);

  const totalAmount = subtotalAmount - watchedDeposit + watchedShipping;

  const mutation = useMutation({
    mutationFn: async (data: EditInvoiceForm) => {
      if (!invoice) throw new Error("No invoice to update");
      
      const { items, deposit = 0, shipping = 0, invoiceDate, ...invoiceData } = data;
      
      // Calculate the final total: subtotal - deposit + shipping
      const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
      const finalTotal = subtotal - deposit + shipping;
      
      const response = await apiRequest("PUT", `/api/invoices/${invoice.id}`, {
        invoice: {
          ...invoiceData,
          invoiceDate: invoiceDate,
          deposit: deposit.toString(),
          shipping: shipping.toString(),
          totalAmount: finalTotal.toString(),
        },
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
        description: "Invoice updated successfully",
      });
      onClose();
      form.reset();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update invoice",
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: EditInvoiceForm) => {
    // selectProduct already supplies the category/details. Keep the invoice's
    // description exactly as edited; rematching inventory here erased names
    // and could replace historical details with a different stock variant.
    mutation.mutate(data);
  };

  const addItem = () => {
    append({
      category: "tyres",
      brand: "",
      pattern: "",
      size: "",
      specialMarkings: "",
      model: "",
      pcd: "",
      color: "",
      productName: "",
      quantity: 1,
      price: 0,
    });
  };

  const searchProducts = (query: string, index: number) => {
    if (!query) return [];
    
    const results = inventoryItems.filter(item => {
      const searchTerm = query.toLowerCase();
      
      if (item.category === "tyres") {
        const tyreName = `${item.brand} ${item.pattern} - ${item.size}`;
        return tyreName.toLowerCase().includes(searchTerm) ||
               (item.brand?.toLowerCase().includes(searchTerm)) ||
               (item.pattern?.toLowerCase().includes(searchTerm)) ||
               (item.size?.toLowerCase().includes(searchTerm));
      } else if (item.category === "wheels") {
        const wheelName = `${item.brand} ${item.model} - ${item.size}`;
        return wheelName.toLowerCase().includes(searchTerm) ||
               (item.brand?.toLowerCase().includes(searchTerm)) ||
               (item.model?.toLowerCase().includes(searchTerm)) ||
               (item.size?.toLowerCase().includes(searchTerm)) ||
               (item.pcd?.toLowerCase().includes(searchTerm)) ||
               (item.color?.toLowerCase().includes(searchTerm));
      } else {
        return item.productName?.toLowerCase().includes(searchTerm);
      }
    }).slice(0, 5); // Limit to 5 results
    
    return results;
  };

  const selectProduct = (product: InventoryItem, index: number) => {
    let productName = "";
    
    if (product.category === "tyres") {
      productName = `${product.brand} ${product.pattern} - ${product.size}`;
    } else if (product.category === "wheels") {
      productName = `${product.brand} ${product.model} - ${product.size}`;
    } else {
      productName = product.productName || "";
    }

    form.setValue(`items.${index}.category`, product.category);
    form.setValue(`items.${index}.brand`, product.brand || "");
    form.setValue(`items.${index}.pattern`, product.pattern || "");
    form.setValue(`items.${index}.size`, product.size || "");
    form.setValue(`items.${index}.specialMarkings`, product.specialMarkings || "");
    form.setValue(`items.${index}.model`, product.model || "");
    form.setValue(`items.${index}.pcd`, product.pcd || "");
    form.setValue(`items.${index}.color`, product.color || "");
    form.setValue(`items.${index}.productName`, productName);
    
    setSearchQueries(prev => ({ ...prev, [index]: productName }));
    setShowResults(prev => ({ ...prev, [index]: false }));
  };

  if (!invoice) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] max-w-4xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Edit Invoice {invoice.invoiceNumber}</DialogTitle>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          {/* Invoice Details */}
          <Card>
            <CardHeader>
              <CardTitle>Invoice Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="invoiceNumber">Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    data-testid="input-invoice-number"
                    {...form.register("invoiceNumber")}
                  />
                  {form.formState.errors.invoiceNumber && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.invoiceNumber.message}
                    </p>
                  )}
                </div>
                <div>
                  <Label htmlFor="invoiceDate">Invoice Date</Label>
                  <DatePicker
                    value={form.watch("invoiceDate")}
                    onChange={(value) => form.setValue("invoiceDate", value, { shouldDirty: true, shouldValidate: true })}
                    required
                    displayFormat="iso"
                    aria-label="Invoice date"
                    data-testid="input-invoice-date"
                  />
                  {form.formState.errors.invoiceDate && (
                    <p className="text-sm text-red-500 mt-1">
                      {form.formState.errors.invoiceDate.message}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                <div>
                  <Label htmlFor="customerName">Customer Name</Label>
                  <Input
                    id="customerName"
                    data-testid="input-customer-name"
                    {...form.register("customerName")}
                  />
                </div>
                <div>
                  <Label htmlFor="carNo">Car Number</Label>
                  <Input
                    id="carNo"
                    data-testid="input-car-no"
                    {...form.register("carNo")}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="remark">Remarks</Label>
                <Textarea
                  id="remark"
                  data-testid="input-remark"
                  {...form.register("remark")}
                />
              </div>

              <div>
                <Label htmlFor="internalNotes">Internal Notes</Label>
                <Textarea
                  id="internalNotes"
                  placeholder="For internal use only - not shown to customers"
                  data-testid="input-internal-notes"
                  {...form.register("internalNotes")}
                />
              </div>

              {!showDepositShipping && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowDepositShipping(true)}
                  data-testid="btn-add-deposit-shipping"
                >
                  Add Deposit/Shipping
                </Button>
              )}

              {showDepositShipping && (
                <div className="grid grid-cols-2 gap-3 sm:gap-4 p-3 sm:p-4 border rounded-lg">
                  <div>
                    <Label htmlFor="deposit">Deposit</Label>
                    <Input
                      id="deposit"
                      type="number"
                      step="0.01"
                      data-testid="input-deposit"
                      {...form.register("deposit", { valueAsNumber: true })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="shipping">Shipping</Label>
                    <Input
                      id="shipping"
                      type="number"
                      step="0.01"
                      data-testid="input-shipping"
                      {...form.register("shipping", { valueAsNumber: true })}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Invoice Items */}
          <Card>
            <CardHeader>
              <CardTitle className="flex justify-between items-center">
                Invoice Items
                <Button
                  type="button"
                  onClick={addItem}
                  size="sm"
                  data-testid="btn-add-item"
                >
                  <Plus className="w-4 h-4 mr-1" />
                  Add Item
                </Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {fields.map((field, index) => (
                <div key={field.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex justify-between items-center">
                    <h4 className="font-medium">Item {index + 1}</h4>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(index)}
                      data-testid={`btn-remove-item-${index}`}
                    >
                      <Minus className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Current Product Name */}
                  <div>
                    <Label htmlFor={`productName-${index}`}>Product Name</Label>
                    <Textarea
                      id={`productName-${index}`}
                      data-testid={`input-product-name-${index}`}
                      {...form.register(`items.${index}.productName`)}
                      placeholder="Enter product name or search below"
                      rows={2}
                      className="resize-y"
                    />
                    {form.formState.errors.items?.[index]?.productName && (
                      <p className="text-sm text-red-500" role="alert">
                        {form.formState.errors.items[index]?.productName?.message}
                      </p>
                    )}
                  </div>

                  {/* Product Search */}
                  <div className="relative">
                    <Label>Search Product (Optional)</Label>
                    <div className="relative">
                      <Input
                        placeholder="Type to search and select from inventory..."
                        value={searchQueries[index] || ""}
                        onChange={(e) => {
                          const query = e.target.value;
                          setSearchQueries(prev => ({ ...prev, [index]: query }));
                          setShowResults(prev => ({ ...prev, [index]: query.length > 0 }));
                        }}
                        data-testid={`input-search-product-${index}`}
                      />
                      <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    </div>
                    
                    {showResults[index] && searchQueries[index] && (
                      <div className="absolute left-0 z-10 mt-1 w-[min(42rem,calc(100vw-2rem))] max-w-[calc(100vw-2rem)] rounded-md border bg-white shadow-lg max-h-60 overflow-y-auto">
                        {searchProducts(searchQueries[index], index).map((product) => (
                          <div
                            key={product.id}
                            className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                            onClick={() => selectProduct(product, index)}
                            data-testid={`product-option-${index}-${product.id}`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="whitespace-normal break-words font-medium">
                                  {product.category === "tyres" && `${product.brand} ${product.pattern} - ${product.size}`}
                                  {product.category === "wheels" && `${product.brand} ${product.model} - ${product.size}`}
                                  {product.category === "others" && product.productName}
                                </div>
                                <div className="text-sm text-gray-500 flex gap-2 mt-1">
                                  <Badge variant="outline" className="text-xs">
                                    {product.category}
                                  </Badge>
                                  {product.category === "tyres" && product.specialMarkings && (
                                    <Badge variant="secondary" className="text-xs">
                                      {product.specialMarkings}
                                    </Badge>
                                  )}
                                  {product.category === "wheels" && (
                                    <>
                                      {product.pcd && (
                                        <Badge variant="secondary" className="text-xs">
                                          PCD: {product.pcd}
                                        </Badge>
                                      )}
                                      {product.color && (
                                        <Badge variant="secondary" className="text-xs">
                                          {product.color}
                                        </Badge>
                                      )}
                                    </>
                                  )}
                                </div>
                              </div>
                              <div className="shrink-0 text-sm text-gray-600">
                                Stock: {product.quantity}
                              </div>
                            </div>
                          </div>
                        ))}
                        {searchProducts(searchQueries[index], index).length === 0 && (
                          <div className="p-3 text-gray-500 text-center">
                            No products found
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label htmlFor={`quantity-${index}`}>Quantity</Label>
                      <Input
                        id={`quantity-${index}`}
                        type="number"
                        min="1"
                        data-testid={`input-quantity-${index}`}
                        {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                      />
                    </div>
                    <div>
                      <Label htmlFor={`price-${index}`}>Price</Label>
                      <Input
                        id={`price-${index}`}
                        type="number"
                        step="0.01"
                        data-testid={`input-price-${index}`}
                        {...form.register(`items.${index}.price`, { valueAsNumber: true })}
                      />
                    </div>
                  </div>
                </div>
              ))}
              
              {form.formState.errors.items && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.items.message}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Total Summary */}
          <Card>
            <CardHeader>
              <CardTitle>Total Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal:</span>
                  <span>${subtotalAmount.toFixed(2)}</span>
                </div>
                {watchedDeposit > 0 && (
                  <div className="flex justify-between text-red-600">
                    <span>Deposit:</span>
                    <span>-${watchedDeposit.toFixed(2)}</span>
                  </div>
                )}
                {watchedShipping > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Shipping:</span>
                    <span>+${watchedShipping.toFixed(2)}</span>
                  </div>
                )}
                <Separator />
                <div className="flex justify-between font-bold text-lg">
                  <span>Total:</span>
                  <span>${totalAmount.toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Form Actions */}
          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              data-testid="btn-cancel"
              className="w-full sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-testid="btn-update-invoice"
              className="w-full sm:w-auto"
            >
              {mutation.isPending ? "Updating..." : "Update Invoice"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}