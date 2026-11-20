import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background p-4" data-testid="not-found-page">
      <Card className="w-full max-w-md mx-4">
        <CardContent className="pt-6">
          <div className="flex flex-col items-center text-center space-y-4">
            <div className="w-16 h-16 bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertCircle className="h-8 w-8 text-destructive" data-testid="error-icon" />
            </div>
            
            <div>
              <h1 className="text-2xl font-bold text-foreground mb-2" data-testid="error-title">
                404 - Page Not Found
              </h1>
              <p className="text-sm text-muted-foreground" data-testid="error-description">
                The page you're looking for doesn't exist or has been moved.
              </p>
            </div>

            <Link href="/">
              <Button className="mt-4" data-testid="btn-home">
                <Home className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
