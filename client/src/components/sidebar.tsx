import { Link, useLocation } from "wouter";
import { BarChart3, Package, Receipt, ChartBar, Car, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Inventory", href: "/inventory", icon: Package },
  { name: "Invoices", href: "/invoices", icon: Receipt },
  { name: "Reports", href: "/reports", icon: ChartBar },
];

export default function Sidebar() {
  const [location] = useLocation();

  return (
    <aside className="bg-card border-r border-border w-64 flex-shrink-0 sidebar-transition" data-testid="sidebar">
      <div className="p-6 border-b border-border">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Car className="text-primary-foreground text-xl" data-testid="logo-icon" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground" data-testid="app-title">TyrePro</h1>
            <p className="text-sm text-muted-foreground" data-testid="app-subtitle">Business Manager</p>
          </div>
        </div>
      </div>
      
      <nav className="p-4 space-y-2" data-testid="sidebar-nav">
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
                className={cn(
                  "flex items-center space-x-3 px-3 py-2 rounded-md transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-secondary text-foreground"
                )}
              >
                <Icon className="w-5 h-5" />
                <span>{item.name}</span>
              </div>
            </Link>
          );
        })}
      </nav>
      
      <div className="mx-4 mt-6 p-4 bg-accent/10 border border-accent/20 rounded-lg" data-testid="low-stock-alert">
        <div className="flex items-center space-x-2 text-accent">
          <TriangleAlert className="w-4 h-4" />
          <span className="text-sm font-medium">Low Stock Alert</span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Some items below minimum threshold</p>
        <Link href="/inventory">
          <button className="text-xs text-primary mt-2 hover:underline" data-testid="view-details-btn">
            View Details
          </button>
        </Link>
      </div>
    </aside>
  );
}
