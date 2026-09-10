import { Nav } from "@/components/Nav";
import { SignOutButton } from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <Nav />
      <main className="page">
        <h1>Settings</h1>
        <p className="page-subtitle">Account details.</p>

        <div className="field-label">Email</div>
        <div>{user?.email}</div>

        <div style={{ marginTop: "2rem" }}>
          <SignOutButton />
        </div>
      </main>
    </>
  );
}
