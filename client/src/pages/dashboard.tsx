import { useQuery, useMutation } from "@tanstack/react-query";
import { ArrowUp, Package, DollarSign, Receipt, Bell, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { queryClient, apiRequest } from "@/lib/queryClient";
import type { InvoiceWithItems } from "@shared/schema";

interface DashboardStats {
  totalInventory: number;
  monthlySales: string;
  lowStockItems: number;
  pendingInvoices: number;
}

export default function Dashboard() {
  const { toast } = useToast();
  
  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/stats"],
  });

  const { data: followUpInvoices = [] } = useQuery<InvoiceWithItems[]>({
    queryKey: ["/api/invoices/follow-up"],
  });

  const markAsPaidMutation = useMutation({
    mutationFn: async (invoiceId: string) => {
      await apiRequest("PUT", `/api/invoices/${invoiceId}/follow-up`, { 
        followUpRequired: 0,
        paymentReceivedDate: new Date().toISOString().split('T')[0]
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices/follow-up"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/stats"] });
      toast({
        title: "Success",
        description: "Invoice marked as paid",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to mark invoice as paid",
        variant: "destructive",
      });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6" data-testid="dashboard-loading">
        <div className="animate-pulse space-y-6">
          <div className="mb-8 h-48 bg-muted rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-muted rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6" data-testid="dashboard-content">
      {/* Hero Section */}
      <div className="mb-5 sm:mb-8 relative overflow-hidden rounded-xl" data-testid="hero-section">
        <img 
          src="https://images.unsplash.com/photo-1558618666-a5c2c8c4035e?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&h=400" 
          alt="Modern tire shop interior" 
          className="w-full h-36 sm:h-48 object-cover" 
        />
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-primary/40 flex items-center">
          <div className="p-4 sm:p-8 text-primary-foreground">
            <h3 className="text-xl sm:text-3xl font-bold mb-1 sm:mb-2">Welcome to TyrePro</h3>
            <p className="text-sm sm:text-lg opacity-90 hidden sm:block">Manage your tyre inventory and invoices efficiently</p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 gap-3 sm:gap-6 mb-5 sm:mb-8" data-testid="stats-cards">
        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">Total Inventory</p>
                <p className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-total-inventory">
                  {stats?.totalInventory || 0}
                </p>
              </div>
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-primary/10 rounded-full flex items-center justify-center shrink-0">
                <Package className="text-primary w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 sm:mt-4 text-xs sm:text-sm text-muted-foreground">
              <span>Items in stock</span>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-3 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {new Date().toLocaleString('en', { month: 'long' })} Revenue
                </p>
                <p className="text-xl sm:text-2xl font-bold text-foreground" data-testid="stat-monthly-sales">
                  ${stats?.monthlySales || "0.00"}
                </p>
              </div>
              <div className="w-9 h-9 sm:w-12 sm:h-12 bg-accent/10 rounded-full flex items-center justify-center shrink-0">
                <DollarSign className="text-accent w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
            <div className="mt-2 sm:mt-4 text-xs sm:text-sm text-muted-foreground">
              <span>Current month (excl. deposits)</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Follow-up Required Section */}
      {followUpInvoices && followUpInvoices.length > 0 && (
        <Card className="mb-6 shadow-sm border-orange-200 dark:border-orange-800">
          <CardContent className="p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-orange-600" />
                <h4 className="text-lg font-semibold text-foreground">Follow-up Required</h4>
                <Badge variant="secondary" data-testid="badge-follow-up-count">
                  {followUpInvoices.length}
                </Badge>
              </div>
            </div>
            <div className="space-y-3" data-testid="follow-up-invoices-list">
              {followUpInvoices.map((invoice) => (
                <div 
                  key={invoice.id} 
                  className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  data-testid={`follow-up-invoice-${invoice.id}`}
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <div>
                        <p className="font-medium text-foreground" data-testid={`follow-up-invoice-number-${invoice.id}`}>
                          {invoice.invoiceNumber}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`follow-up-customer-${invoice.id}`}>
                          {invoice.customerName || "No customer name"}{invoice.carNo && ` • ${invoice.carNo}`}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="font-semibold text-foreground" data-testid={`follow-up-amount-${invoice.id}`}>
                        ${parseFloat(invoice.totalAmount).toFixed(2)}
                      </p>
                      <p className="text-sm text-muted-foreground" data-testid={`follow-up-date-${invoice.id}`}>
                        {invoice.invoiceDate}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => markAsPaidMutation.mutate(invoice.id)}
                      disabled={markAsPaidMutation.isPending}
                      data-testid={`btn-mark-paid-${invoice.id}`}
                    >
                      <Check className="w-4 h-4 mr-2" />
                      Mark as Paid
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6" data-testid="recent-activity">
        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-foreground mb-4">Quick Actions</h4>
            <div className="space-y-3">
              <button 
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                data-testid="quick-action-add-inventory"
                onClick={() => window.location.href = '/inventory'}
              >
                <div className="flex items-center space-x-3">
                  <Package className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Add Inventory Item</p>
                    <p className="text-sm text-muted-foreground">Add new products to your inventory</p>
                  </div>
                </div>
              </button>
              <button 
                className="w-full text-left p-3 rounded-lg border border-border hover:bg-muted transition-colors"
                data-testid="quick-action-create-invoice"
                onClick={() => window.location.href = '/invoices'}
              >
                <div className="flex items-center space-x-3">
                  <Receipt className="w-5 h-5 text-primary" />
                  <div>
                    <p className="font-medium">Create Invoice</p>
                    <p className="text-sm text-muted-foreground">Generate a new customer invoice</p>
                  </div>
                </div>
              </button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm">
          <CardContent className="p-6">
            <h4 className="text-lg font-semibold text-foreground mb-4">Business Summary</h4>
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-foreground">Total Products</span>
                <span className="font-semibold text-foreground">{stats?.totalInventory || 0}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-border">
                <span className="text-sm text-foreground">{new Date().toLocaleString('en', { month: 'long' })} Revenue</span>
                <span className="font-semibold text-green-600">${stats?.monthlySales || "0.00"}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
