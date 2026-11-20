import { useLocation, Link } from "wouter";
import { Bell, Home, Package, Receipt, BarChart3, PieChart, LogOut, Settings, Truck, ClipboardList, WalletCards } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import ChangePasswordModal from "@/components/change-password-modal";

const pageConfig = {
  "/": {
    title: "Dashboard",
    subtitle: "Overview of your tyre business"
  },
  "/inventory": {
    title: "Inventory Management",
    subtitle: "Manage your tyre stock and inventory levels"
  },
  "/invoices": {
    title: "Invoice Management",
    subtitle: "Create and manage customer invoices"
  },
  "/expenses": {
    title: "Expenses",
    subtitle: "Track business expenses and monthly recurring costs"
  },
  "/reports": {
    title: "Reports & Analytics",
    subtitle: "View business insights and performance metrics"
  },
  "/statistics": {
    title: "Statistics",
    subtitle: "Analyze product sales and customer trends"
  },
  "/supply": {
    title: "Supply",
    subtitle: "Search and manage tyre supply information by size"
  },
  "/order": {
    title: "Order",
    subtitle: "Manage client orders and pricing"
  }
};

const navigation = [
  { name: "Dashboard", href: "/", icon: Home },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Expenses", href: "/expenses", icon: WalletCards },
  { name: "Reports", href: "/reports", icon: BarChart3 },
  { name: "Statistics", href: "/statistics", icon: PieChart },
  { name: "Supply", href: "/supply", icon: Truck },
  { name: "Order", href: "/order", icon: ClipboardList },
];

export default function Header() {
  const [location] = useLocation();
  const config = pageConfig[location as keyof typeof pageConfig] || pageConfig["/"];
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/auth/logout", {});
      return await response.json();
    },
    onSuccess: () => {
      toast({
        title: "Logged Out",
        description: "You have been successfully logged out.",
      });
      // Invalidate all queries and redirect to login
      queryClient.clear();
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: "Logout Failed",
        description: error?.message || "There was an error logging out",
        variant: "destructive",
      });
    },
  });

  const handleLogout = () => {
    logoutMutation.mutate();
  };

  return (
    <header className="bg-card border-b border-border" data-testid="header">
      {/* Title Section */}
      <div className="px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="min-w-0 mr-2">
            <h2 className="text-lg sm:text-2xl font-semibold text-foreground truncate" data-testid="page-title">
              {config.title}
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground hidden sm:block" data-testid="page-subtitle">
              {config.subtitle}
            </p>
          </div>
          <div className="flex items-center space-x-4">
            <button 
              className="relative p-2 text-muted-foreground hover:text-foreground transition-colors"
              data-testid="notifications-btn"
            >
              <Bell className="w-5 h-5" />
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground text-xs rounded-full flex items-center justify-center">
                3
              </span>
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="flex items-center space-x-3 p-2" data-testid="user-profile">
                  <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
                    <span className="text-primary-foreground text-sm font-medium">KWT</span>
                  </div>
                  <span className="text-sm font-medium text-foreground hidden sm:block">Kwok Wah Tyre</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem className="font-medium">
                  kwokwahtyre
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <ChangePasswordModal>
                  <DropdownMenuItem 
                    className="cursor-pointer"
                    onSelect={(e) => e.preventDefault()}
                    data-testid="menu-change-password"
                  >
                    <Settings className="mr-2 h-4 w-4" />
                    Change Password
                  </DropdownMenuItem>
                </ChangePasswordModal>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  className="cursor-pointer text-destructive focus:text-destructive"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  data-testid="menu-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  {logoutMutation.isPending ? "Logging out..." : "Logout"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
      
      {/* Navigation */}
      <div className="border-t border-border">
        <nav className="flex overflow-x-auto scrollbar-none px-3 py-2 gap-1" data-testid="mobile-nav">
          {navigation.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;
            
            return (
              <Link
                key={item.name}
                href={item.href}
                data-testid={`nav-link-${item.name.toLowerCase()}`}
              >
                <div
                  className={`flex flex-col items-center px-3 py-2 rounded-lg transition-colors min-w-[60px] shrink-0 ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-secondary text-foreground"
                  }`}
                >
                  <Icon className="w-5 h-5 mb-1" />
                  <span className="text-xs font-medium whitespace-nowrap">{item.name}</span>
                </div>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
