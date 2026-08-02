import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Layout from "@/components/layout/Layout";
import Home from "@/pages/Home";
import About from "@/pages/About";
import MarketIntelligence from "@/pages/MarketIntelligence";
import TopPicks from "@/pages/TopPicks";
import Contact from "@/pages/Contact";
import Listings from "@/pages/Listings";
import Sold from "@/pages/Sold";

// Admin
import AdminLayout from "@/components/admin/AdminLayout";
import { ProtectedRoute } from "@/components/admin/ProtectedRoute";
import AdminLogin from "@/pages/admin/Login";
import TotpSetup from "@/pages/admin/TotpSetup";
import AdminDashboard from "@/pages/admin/Dashboard";
import AdminInquiries from "@/pages/admin/Inquiries";
import AdminTransactions from "@/pages/admin/Transactions";
import AdminContent from "@/pages/admin/Content";
import AdminIntelligence from "@/pages/admin/Intelligence";
import AdminContacts from "@/pages/admin/Contacts";
import AdminSettings from "@/pages/admin/Settings";

const queryClient = new QueryClient();

function PublicRouter() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/market-intelligence" component={MarketIntelligence} />
        <Route path="/top-picks" component={TopPicks} />
        <Route path="/contact" component={Contact} />
        <Route path="/listings" component={Listings} />
        <Route path="/sold" component={Sold} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function AdminRouter() {
  return (
    <Switch>
      {/* Unauthenticated admin routes */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/totp-setup" component={TotpSetup} />

      {/* Protected admin routes — all wrapped in ProtectedRoute + AdminLayout */}
      <Route path="/admin/:rest*">
        <ProtectedRoute>
          <AdminLayout>
            <Switch>
              <Route path="/admin" component={AdminDashboard} />
              <Route path="/admin/inquiries" component={AdminInquiries} />
              <Route path="/admin/transactions" component={AdminTransactions} />
              <Route path="/admin/content" component={AdminContent} />
              <Route path="/admin/intelligence" component={AdminIntelligence} />
              <Route path="/admin/contacts" component={AdminContacts} />
              <Route path="/admin/settings/totp-setup" component={TotpSetup} />
              <Route path="/admin/settings" component={AdminSettings} />
              <Route component={NotFound} />
            </Switch>
          </AdminLayout>
        </ProtectedRoute>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Switch>
            <Route path="/admin/:rest*" component={AdminRouter} />
            <Route path="/admin" component={AdminRouter} />
            <Route component={PublicRouter} />
          </Switch>
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
