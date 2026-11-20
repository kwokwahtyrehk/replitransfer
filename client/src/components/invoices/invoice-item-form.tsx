import { Trash2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import type { InventoryItem } from "@shared/schema";

interface InvoiceItemFormProps {
  index: number;
  form: UseFormReturn<any>;
  inventoryItems: InventoryItem[];
  onRemove: () => void;
  canRemove: boolean;
}

export default function InvoiceItemForm({ 
  index, 
  form, 
  inventoryItems, 
  onRemove, 
  canRemove 
}: InvoiceItemFormProps) {
  
  const handleProductSelect = (productName: string) => {
    const product = inventoryItems.find(item => item.productName === productName);
    if (product) {
      form.setValue(`items.${index}.productName`, productName);
      form.setValue(`items.${index}.size`, product.size);
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg" data-testid={`invoice-item-${index}`}>
      <div className="md:col-span-2">
        <FormField
          control={form.control}
          name={`items.${index}.productName`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Product</FormLabel>
              <Select 
                onValueChange={handleProductSelect}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger data-testid={`select-product-${index}`}>
                    <SelectValue placeholder="Select Product" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {inventoryItems.map((item) => (
                    <SelectItem key={item.id} value={item.productName}>
                      {item.productName} - {item.size} (Stock: {item.quantity})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      
      <div>
        <FormField
          control={form.control}
          name={`items.${index}.quantity`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Quantity</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  placeholder="0"
                  {...field}
                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                  data-testid={`input-quantity-${index}`}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      
      <div>
        <FormField
          control={form.control}
          name={`items.${index}.price`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Price</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0.00"
                  {...field}
                  onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                  data-testid={`input-price-${index}`}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      
      <div>
        <FormField
          control={form.control}
          name={`items.${index}.remark`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remark</FormLabel>
              <FormControl>
                <Input
                  placeholder="Optional"
                  {...field}
                  data-testid={`input-remark-${index}`}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
      
      <div className="flex items-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={!canRemove}
          data-testid={`btn-remove-item-${index}`}
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
