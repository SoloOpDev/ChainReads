import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Layout } from "@/components/layout";
import Home from "@/pages/home";
import Article from "@/pages/article";
import Trading from "@/pages/trading";
import Airdrop from "@/pages/airdrop";
import Telegram from "@/pages/telegram";
import MyPoints from "@/pages/my-points";
import Academic from "@/pages/academic";
import Predictions from "@/pages/predictions";
import NotFound from "@/pages/not-found";
import { Component, ReactNode } from "react";

// Error Boundary Component
class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
    // Redirect to homepage after 2 seconds
    setTimeout(() => {
      window.location.href = '/';
    }, 2000);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-950">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-white mb-4">Something went wrong</h1>
            <p className="text-gray-400 mb-4">Redirecting to homepage...</p>
            <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/" component={Home} />
        <Route path="/article/:id" component={Article} />
        <Route path="/trading" component={Trading} />
        <Route path="/airdrop" component={Airdrop} />
        <Route path="/telegram" component={Telegram} />
        <Route path="/my-points" component={MyPoints} />
        <Route path="/academic" component={Academic} />
        <Route path="/predictions" component={Predictions} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}

export default App;
