import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { Invoice } from "@shared/schema";

interface CalculateProfitModalProps {
  invoice: Invoice | null;
  isOpen: boolean;
  onClose: () => void;
}

export function CalculateProfitModal({
  invoice,
  isOpen,
  onClose,
}: CalculateProfitModalProps) {
  const [cost, setCost] = useState<string>("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (data: { invoiceId: string; cost: number | null }) => {
      const response = await fetch(`/api/invoices/${data.invoiceId}/profit`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cost: data.cost }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Failed to calculate profit' }));
        throw new Error(errorData.message || 'Failed to calculate profit');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Profit calculated and saved successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      onClose();
      setCost("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to calculate profit. Please try again.",
        variant: "destructive",
      });
      console.error("Calculate profit error:", error);
    },
  });

  if (!invoice) return null;

  const invoiceTotal = parseFloat(invoice.totalAmount);
  const costAmount = cost === "" ? 0 : parseFloat(cost);
  const calculatedProfit = invoiceTotal - costAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (cost !== "" && (Number.isNaN(costAmount) || costAmount < 0)) {
      toast({
        title: "Invalid Input",
        description: "Please enter a valid cost amount.",
        variant: "destructive",
      });
      return;
    }
    
    mutation.mutate({
      invoiceId: invoice.id,
      cost: cost === "" ? null : costAmount,
    });
  };

  const handleClose = () => {
    onClose();
    setCost("");
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]" data-testid="dialog-calculate-profit">
        <DialogHeader>
          <DialogTitle>Calculate Profit</DialogTitle>
          <DialogDescription>
            Enter the total cost to calculate profit for invoice {invoice.invoiceNumber}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4">
            <div className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded">
              <span className="font-medium">Invoice Amount:</span>
              <span className="text-lg font-bold text-green-600">
                ${invoiceTotal.toFixed(2)}
              </span>
            </div>

            <div className="space-y-2">
              <Label htmlFor="cost">Total Cost</Label>
              <Input
                id="cost"
                type="number"
                step="0.01"
                min="0"
                placeholder="Enter total cost..."
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                data-testid="input-cost"
              />
            </div>

            {cost && (
              <div className="flex justify-between items-center py-3 px-4 bg-blue-50 rounded-lg border-l-4 border-blue-400">
                <span className="font-medium text-blue-800">Calculated Profit:</span>
                <span className={`text-xl font-bold ${calculatedProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                  ${calculatedProfit.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              data-testid="button-cancel"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending}
              data-testid="button-save-profit"
            >
              {mutation.isPending ? "Calculating..." : "Save Profit"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}