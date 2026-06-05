import "./dashboard.css";
import { Sidebar } from "@/components/dashboard/Sidebar";
import { Header } from "@/components/dashboard/Header";
import { HeaderTitleProvider } from "@/components/dashboard/HeaderTitle";

// Persistent chrome for every authenticated route. Lives in a route
// GROUP — `(dashboard)` adds no URL segment — so the marketing landing
// at app/page.tsx (outside this group) renders with the root layout
// only and never inherits the sidebar/header. Importing dashboard.css
// here scopes those styles to the dashboard bundle, keeping the
// landing's bare-element rules and these app rules from colliding.
//
// proxy.ts already gates every route except `/` behind a Clerk session,
// so anything rendered under this layout is guaranteed signed-in.
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <HeaderTitleProvider>
      <div className="dash-root">
        <Sidebar />
        <div className="dash-main-col">
          <Header />
          <main className="dash-main">{children}</main>
        </div>
      </div>
    </HeaderTitleProvider>
  );
}
