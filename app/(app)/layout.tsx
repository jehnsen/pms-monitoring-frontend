import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { AuthGuard } from "@/components/auth/auth-guard";
import { TenantBranding } from "@/components/layout/tenant-branding";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <TenantBranding />
      <div className="min-h-screen bg-page">
        <Sidebar />
        <div className="lg:pl-[256px]">
          <Topbar />
          <main id="main-content" className="app-workspace mx-auto max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}
