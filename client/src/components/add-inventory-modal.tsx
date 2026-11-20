import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Plus, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { insertInventoryItemValidatedSchema, type InventoryItemWithDotUnits, type InsertInventoryItem } from "@shared/schema";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface AddInventoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingItem?: InventoryItemWithDotUnits | null;
  initialValues?: Partial<InsertInventoryItem>;
  onInventoryCreated?: (item: InventoryItemWithDotUnits) => void;
}

type DotUnitDraft = {
  id?: string;
  dotCode: string;
  atWarehouse: boolean;
};

function getFormValues(
  editingItem?: InventoryItemWithDotUnits | null,
  initialValues?: Partial<InsertInventoryItem>,
): InsertInventoryItem {
  if (editingItem) {
    return {
      category: editingItem.category,
      brand: editingItem.brand || "",
      pattern: editingItem.pattern || "",
      size: editingItem.size || "",
      specialMarkings: editingItem.specialMarkings || "",
      model: editingItem.model || "",
      pcd: editingItem.pcd || "",
      color: editingItem.color || "",
      productName: editingItem.productName || "",
      quantity: editingItem.quantity || undefined,
      costPrice: editingItem.costPrice ? Number(editingItem.costPrice) : undefined,
      sellingPrice: editingItem.sellingPrice ? Number(editingItem.sellingPrice) : undefined,
      remark: editingItem.remark || "",
    } as InsertInventoryItem;
  }

  return {
    category: "tyres",
    brand: "",
    pattern: "",
    size: "",
    specialMarkings: "",
    model: "",
    pcd: "",
    color: "",
    productName: "",
    quantity: undefined,
    costPrice: undefined,
    sellingPrice: undefined,
    remark: "",
    ...initialValues,
  } as unknown as InsertInventoryItem;
}

export default function AddInventoryModal({
  isOpen,
  onClose,
  editingItem,
  initialValues,
  onInventoryCreated,
}: AddInventoryModalProps) {
  const { toast } = useToast();
  const isEditing = !!editingItem;
  const getDotUnitsValue = (item?: InventoryItemWithDotUnits | null): DotUnitDraft[] => {
    const units = item?.dotUnits
      .filter((unit) => unit.status === "available")
      .map((unit) => ({ id: unit.id, dotCode: unit.dotCode, atWarehouse: unit.atWarehouse })) ?? [];
    return units.length > 0 ? units : [{ dotCode: "", atWarehouse: false }];
  };
  const [dotUnitDrafts, setDotUnitDrafts] = useState(() => getDotUnitsValue(editingItem));

  const form = useForm<InsertInventoryItem>({
    resolver: zodResolver(insertInventoryItemValidatedSchema),
    defaultValues: getFormValues(editingItem, initialValues),
  });

  const selectedCategory = form.watch("category");

  const mutation = useMutation({
    mutationFn: async ({ data, dotUnits }: { data: InsertInventoryItem; dotUnits?: DotUnitDraft[] }) => {
      const payload = {
        ...data,
        ...(dotUnits !== undefined ? { dotUnits } : {}),
        ...(isEditing ? { sellingPrice: data.sellingPrice ?? null } : {}),
      };
      if (isEditing) {
        const response = await apiRequest("PUT", `/api/inventory/${editingItem.id}`, payload);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/inventory", payload);
        return response.json();
      }
    },
    onSuccess: (createdItem: InventoryItemWithDotUnits) => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: `Inventory item ${isEditing ? "updated" : "created"} successfully`,
      });
      if (!isEditing) {
        onInventoryCreated?.(createdItem);
      }
      onClose();
      form.reset(getFormValues(editingItem, initialValues));
      setDotUnitDrafts(getDotUnitsValue(editingItem));
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || `Failed to ${isEditing ? "update" : "create"} inventory item`,
        variant: "destructive",
      });
    },
  });

  const onSubmit = (data: InsertInventoryItem) => {
    const dotUnits = dotUnitDrafts
      .filter((unit) => unit.dotCode.trim())
      .map((unit) => ({ ...unit, dotCode: unit.dotCode.trim().toUpperCase() }));
    if (selectedCategory === "tyres") {
      if (dotUnits.length > (data.quantity ?? 0)) {
        toast({ title: "Too many DOT units", description: "DOT entries cannot exceed the available quantity.", variant: "destructive" });
        return;
      }
    }
    mutation.mutate({ data, dotUnits: selectedCategory === "tyres" ? dotUnits : undefined });
  };

  const handleClose = () => {
    onClose();
    form.reset(getFormValues(editingItem, initialValues));
    setDotUnitDrafts(getDotUnitsValue(editingItem));
  };

  // Reset form whenever a different item or set of prefilled values is opened.
  useEffect(() => {
    if (isOpen) {
      form.reset(getFormValues(editingItem, initialValues));
      setDotUnitDrafts(getDotUnitsValue(editingItem));
    }
  }, [editingItem, form, initialValues, isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent
        className="flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0"
        data-testid="add-inventory-modal"
      >
        <DialogHeader className="shrink-0 border-b px-5 py-4 pr-12 sm:px-6">
          <DialogTitle data-testid="modal-title">
            {isEditing ? "Edit Product" : "Add New Product"}
          </DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex min-h-0 flex-1 flex-col"
            data-testid="inventory-form"
          >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
            {/* Category Selection */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Category *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger data-testid="select-category">
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="tyres">Tyres</SelectItem>
                      <SelectItem value="wheels">Wheels</SelectItem>
                      <SelectItem value="others">Others</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category-specific fields */}
            {selectedCategory === "tyres" && (
              <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Michelin"
                          {...field}
                          data-testid="input-brand"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="pattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pattern *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Pilot Sport 4"
                          {...field}
                          data-testid="input-pattern"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Size *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 225/45R17"
                          {...field}
                          data-testid="input-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specialMarkings"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Special Markings</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., XL, RFT"
                          {...field}
                          data-testid="input-special-markings"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="space-y-2">
                <FormLabel>DOT units</FormLabel>
                {dotUnitDrafts.map((unit, index) => (
                  <div key={unit.id ?? index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
                    <Input
                      value={unit.dotCode}
                      onChange={(event) => setDotUnitDrafts((current) => current.map((entry, entryIndex) =>
                        entryIndex === index ? { ...entry, dotCode: event.target.value } : entry
                      ))}
                      placeholder="e.g. 2524"
                      data-testid={`input-dot-code-${index}`}
                    />
                    <div className="flex shrink-0 items-center gap-2 rounded-md border px-3 py-2">
                      <Checkbox
                        checked={unit.atWarehouse}
                        onCheckedChange={(checked) => setDotUnitDrafts((current) => current.map((entry, entryIndex) =>
                          entryIndex === index ? { ...entry, atWarehouse: checked === true } : entry
                        ))}
                        data-testid={`checkbox-dot-warehouse-${index}`}
                      />
                      <span className="text-sm">貨倉</span>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setDotUnitDrafts((current) =>
                        current.length === 1
                          ? [{ dotCode: "", atWarehouse: false }]
                          : current.filter((_, entryIndex) => entryIndex !== index)
                      )}
                      aria-label="Remove DOT unit"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setDotUnitDrafts((current) => [...current, { dotCode: "", atWarehouse: false }])}
                  data-testid="btn-add-dot-unit"
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add DOT unit
                </Button>
                <p className="text-xs text-muted-foreground">
                  Optional. Add only the physical tyre units you want to track. Repeated DOT codes are allowed when multiple tyres share the same DOT; entries cannot exceed stock quantity.
                </p>
              </div>
              </>
            )}

            {selectedCategory === "wheels" && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="brand"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Brand *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., BBS"
                          {...field}
                          data-testid="input-brand"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="model"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Model *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., CH-R"
                          {...field}
                          data-testid="input-model"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="size"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Size *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 18x8.5"
                          {...field}
                          data-testid="input-size"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="pcd"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PCD *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., 5x112"
                          {...field}
                          data-testid="input-pcd"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Color *</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="e.g., Black"
                          {...field}
                          data-testid="input-color"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}

            {selectedCategory === "others" && (
              <FormField
                control={form.control}
                name="productName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Product Name *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="e.g., Wheel Balancing Weights"
                        {...field}
                        data-testid="input-product-name"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            {/* Common fields for all categories */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Quantity *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Enter quantity"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseInt(e.target.value) : undefined)}
                        data-testid="input-quantity"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Price fields */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="costPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cost Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter cost price (optional)"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value ? parseFloat(e.target.value) : undefined)}
                        data-testid="input-cost-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="sellingPrice"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Selling Price</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="Enter selling price (optional)"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? null : parseFloat(e.target.value))}
                        data-testid="input-selling-price"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            <FormField
              control={form.control}
              name="remark"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Remark</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Enter remark (optional)"
                      rows={3}
                      {...field}
                      value={field.value ?? ""}
                      data-testid="input-remark"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            </div>

            <div className="flex shrink-0 justify-end space-x-3 border-t bg-background px-5 py-4 sm:px-6">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                data-testid="btn-cancel"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={mutation.isPending}
                data-testid="btn-save"
              >
                {mutation.isPending 
                  ? (isEditing ? "Updating..." : "Adding...") 
                  : (isEditing ? "Update Product" : "Add Product")
                }
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
