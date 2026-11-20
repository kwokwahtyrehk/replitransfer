import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useQuery } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Inventory from "@/pages/inventory";
import Invoices from "@/pages/invoices";
import Expenses from "@/pages/expenses";
import Reports from "@/pages/reports";
import Statistics from "@/pages/statistics";
import Supply from "@/pages/supply";
import Order from "@/pages/order";
import Login from "@/pages/login";
import Header from "@/components/header";
import { SessionTimeoutModal } from "@/components/session-timeout-modal";
import { useSessionTimeout } from "@/hooks/useSessionTimeout";
import { useState, useEffect, useCallback } from "react";

function AuthenticatedApp() {
  return (
    <div className="h-screen overflow-hidden">
      <main className="h-full overflow-auto">
        <Header />
        <Switch>
          <Route path="/" component={Dashboard} />
          <Route path="/inventory" component={Inventory} />
          <Route path="/invoices" component={Invoices} />
          <Route path="/expenses" component={Expenses} />
          <Route path="/reports" component={Reports} />
          <Route path="/statistics" component={Statistics} />
          <Route path="/supply" component={Supply} />
          <Route path="/order" component={Order} />
          <Route component={NotFound} />
        </Switch>
      </main>
    </div>
  );
}

function AppContent() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeoutWarning, setShowTimeoutWarning] = useState(false);

  const { data: authStatus } = useQuery({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me", {
          credentials: "include",
        });
        if (response.ok) {
          return await response.json();
        }
        return { authenticated: false };
      } catch (error) {
        return { authenticated: false };
      }
    },
    refetchOnWindowFocus: false,
    retry: false,
  });

  useEffect(() => {
    if (authStatus !== undefined) {
      setIsAuthenticated(authStatus.authenticated);
      setIsLoading(false);
    }
  }, [authStatus]);

  const handleLoginSuccess = () => {
    setIsAuthenticated(true);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  const handleLogout = useCallback(async () => {
    setShowTimeoutWarning(false);
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setIsAuthenticated(false);
    queryClient.clear();
  }, []);

  const { resetTimer } = useSessionTimeout({
    enabled: isAuthenticated,
    onWarn: () => setShowTimeoutWarning(true),
    onExpire: handleLogout,
  });

  const handleStayLoggedInFull = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/ping", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        handleLogout();
        return;
      }
    } catch {
      handleLogout();
      return;
    }
    setShowTimeoutWarning(false);
    resetTimer();
  }, [handleLogout, resetTimer]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse">
          <h1 className="text-2xl font-bold text-muted-foreground">Loading...</h1>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <>
      <AuthenticatedApp />
      <SessionTimeoutModal
        open={showTimeoutWarning}
        onStayLoggedIn={handleStayLoggedInFull}
        onLogout={handleLogout}
      />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AppContent />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
