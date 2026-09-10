import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// For Server Components (owner-scoped reads, e.g. /dashboard and /company/[id]).
// Server Components can't set cookies, so setAll is a no-op here — session refresh
// happens in middleware.ts instead.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // no-op: see comment above
        },
      },
    }
  );
}
