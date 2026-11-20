import { useLocation } from "wouter";
import { Bell } from "lucide-react";

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
  "/reports": {
    title: "Reports & Analytics",
    subtitle: "View business insights and performance metrics"
  }
};

export default function Header() {
  const [location] = useLocation();
  const config = pageConfig[location as keyof typeof pageConfig] || pageConfig["/"];

  return (
    <header className="bg-card border-b border-border px-6 py-4" data-testid="header">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-foreground" data-testid="page-title">
            {config.title}
          </h2>
          <p className="text-sm text-muted-foreground" data-testid="page-subtitle">
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
          <div className="flex items-center space-x-3" data-testid="user-profile">
            <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center">
              <span className="text-primary-foreground text-sm font-medium">KWT</span>
            </div>
            <span className="text-sm font-medium text-foreground">Kwok Wah Tyre</span>
          </div>
        </div>
      </div>
    </header>
  );
}
