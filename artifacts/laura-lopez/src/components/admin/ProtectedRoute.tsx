import { type ReactNode } from "react";
import { Redirect } from "wouter";
import { useAdminAuth } from "@/hooks/useAdminAuth";

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, isLoading } = useAdminAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return <Redirect to="/admin/login" />;
  }

  if (!user.totpEnabled) {
    return <Redirect to="/admin/totp-setup" />;
  }

  return <>{children}</>;
}
