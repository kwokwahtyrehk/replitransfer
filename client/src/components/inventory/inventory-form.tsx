import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
import { insertInventoryItemSchema, type InventoryItem, type InsertInventoryItem } from "@shared/schema";

interface InventoryFormProps {
  editingItem?: InventoryItem | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function InventoryForm({ editingItem, onSuccess, onCancel }: InventoryFormProps) {
  const { toast } = useToast();
  const isEditing = !!editingItem;

  const form = useForm<InsertInventoryItem>({
    resolver: zodResolver(insertInventoryItemSchema),
    defaultValues: editingItem || {
      brand: "",
      pattern: "",
      size: "",
      pcd: "",
      color: "",
      quantity: 0,
      remark: "",
    },
  });

  const mutation = useMutation({
    mutationFn: async (data: InsertInventoryItem) => {
      if (isEditing) {
        const response = await apiRequest("PUT", `/api/inventory/${editingItem.id}`, data);
        return response.json();
      } else {
        const response = await apiRequest("POST", "/api/inventory", data);
        return response.json();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: `Inventory item ${isEditing ? "updated" : "created"} successfully`,
      });
      onSuccess();
      form.reset();
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
    mutation.mutate(data);
  };

  // Reset form when editingItem changes
  useEffect(() => {
    if (editingItem) {
      form.reset({
        brand: editingItem.brand,
        pattern: editingItem.pattern,
        size: editingItem.size,
        pcd: editingItem.pcd || "",
        color: editingItem.color || "",
        quantity: editingItem.quantity,
        remark: editingItem.remark || "",
      });
    } else {
      form.reset({
        brand: "",
        pattern: "",
        size: "",
        pcd: "",
        color: "",
        quantity: 0,
        remark: "",
      });
    }
  }, [editingItem, form]);

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4" data-testid="inventory-form">
        <div className="grid grid-cols-2 gap-4">
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
        </div>
        
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
        
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="pcd"
            render={({ field }) => (
              <FormItem>
                <FormLabel>PCD</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., 5x112"
                    {...field}
                    value={field.value ?? ""}
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
                <FormLabel>Color</FormLabel>
                <FormControl>
                  <Input
                    placeholder="e.g., Black"
                    {...field}
                    value={field.value ?? ""}
                    data-testid="input-color"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        
        <FormField
          control={form.control}
          name="quantity"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="Enter quantity"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  data-testid="input-quantity"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
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
        
        <div className="flex justify-end space-x-3 pt-4">
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
  );
}
