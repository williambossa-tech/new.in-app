import { AppShell } from "@/components/AppShell";
import { requireUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  return <AppShell user={me}>{children}</AppShell>;
}
