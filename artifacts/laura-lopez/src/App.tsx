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

const queryClient = new QueryClient();

function Router() {
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
