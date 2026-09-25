import { DashboardSidebar } from "@/components/dashboard-sidebar";
import { DashboardContent } from "@/components/dashboard-content";

export default function AppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="min-h-screen bg-dark-950">
      <DashboardSidebar />
      <DashboardContent>{children}</DashboardContent>
    </div>
  );
}
