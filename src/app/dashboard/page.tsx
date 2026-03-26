import { createClient } from "@/src/utils/supabase/server";
import { redirect } from "next/navigation";
import { ClientDashboard } from "./client-dashboard";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <ClientDashboard userId={user.id} userEmail={user.email ?? null} />
  );
}
