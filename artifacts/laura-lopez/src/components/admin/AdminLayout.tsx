import { useState, useEffect, type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  MessageSquare,
  ArrowLeftRight,
  FileText,
  BarChart2,
  Users,
  Settings,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useAdminAuth } from "@/hooks/useAdminAuth";
import { useQuery } from "@tanstack/react-query";
import { adminApi } from "@/lib/admin-api";

const navItems = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/inquiries", label: "Inquiries", icon: MessageSquare, badge: true },
  { href: "/admin/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/admin/content", label: "Content", icon: FileText },
  { href: "/admin/intelligence", label: "Intelligence", icon: BarChart2 },
  { href: "/admin/contacts", label: "Contacts", icon: Users },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

function useUnreadCount() {
  return useQuery({
    queryKey: ["admin-unread-count"],
    queryFn: () => adminApi.listInquiries({ page: 1 }).then((r) => r.unreadCount),
    refetchInterval: 30_000,
  });
}

interface AdminLayoutProps {
  children: ReactNode;
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  const [location] = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { user, logout } = useAdminAuth();
  const { data: unreadCount } = useUnreadCount();

  // Scroll lock when drawer open
  useEffect(() => {
    document.body.style.overflow = drawerOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [drawerOpen]);

  // Close drawer on ≥ md
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const handler = (e: MediaQueryListEvent) => { if (e.matches) setDrawerOpen(false); };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const handleNav = () => setDrawerOpen(false);

  function isActive(href: string, exact?: boolean) {
    if (exact) return location === href;
    return location.startsWith(href);
  }

  const NavContent = () => (
    <nav className="flex flex-col gap-0.5 flex-1">
      {navItems.map((item) => {
        const active = isActive(item.href, item.exact);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={handleNav}
            className={`flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors ${
              active
                ? "bg-primary text-white"
                : "text-foreground/70 hover:bg-muted hover:text-foreground"
            }`}
          >
            <Icon size={16} className="shrink-0" />
            <span>{item.label}</span>
            {item.badge && unreadCount != null && unreadCount > 0 && (
              <span className="ml-auto bg-secondary text-white text-xs rounded-full px-1.5 py-0.5 min-w-[1.25rem] text-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-background font-sans">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border bg-card shrink-0">
        <div className="px-4 py-4 border-b border-border">
          <Link href="/admin" className="text-sm font-semibold tracking-wider uppercase text-primary">
            Admin
          </Link>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">
            {user?.name ?? "—"}
          </p>
        </div>
        <div className="flex flex-col flex-1 p-3 gap-4">
          <NavContent />
          <button
            onClick={() => logout.mutate()}
            className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors w-full text-left"
          >
            <LogOut size={16} className="shrink-0" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Top bar — mobile */}
        <header className="md:hidden flex items-center justify-between px-4 h-12 border-b border-border bg-card shrink-0">
          <span className="text-sm font-semibold tracking-wider uppercase text-primary">Admin</span>
          <button
            onClick={() => setDrawerOpen((o) => !o)}
            className="p-1 text-foreground"
            aria-label="Toggle menu"
          >
            {drawerOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </header>

        {/* Mobile drawer */}
        {drawerOpen && (
          <div
            className="md:hidden fixed inset-0 z-50 bg-black/40"
            onClick={handleNav}
          >
            <div
              className="absolute left-0 top-0 bottom-0 w-56 bg-card border-r border-border flex flex-col p-3 gap-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-1 py-2 border-b border-border mb-1">
                <p className="text-sm font-semibold tracking-wider uppercase text-primary">Admin</p>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{user?.name ?? "—"}</p>
              </div>
              <NavContent />
              <button
                onClick={() => { logout.mutate(); handleNav(); }}
                className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground hover:text-destructive hover:bg-muted rounded transition-colors w-full text-left"
              >
                <LogOut size={16} className="shrink-0" />
                Sign out
              </button>
            </div>
          </div>
        )}

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
