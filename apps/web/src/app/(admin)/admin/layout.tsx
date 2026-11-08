import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import type { MeResponse } from "@alkeva/shared";
import { AdminShell } from "@/components/admin/admin-shell";

const STAFF = new Set(["administrator", "compliance", "finance"]);

/**
 * The staff console does not exist for anyone who is not staff: a signed-out
 * visitor or a customer gets the ordinary 404, so the route reveals nothing.
 *
 * Decided on the server where it can be: the access cookie is sent to the
 * API's /auth/me as a bearer token. When the access token has expired but a
 * refresh cookie is still there, the server cannot refresh it (a server
 * component cannot set cookies), so the client shell refreshes and applies
 * the same rule. The API's RolesGuard stays the real boundary either way.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  const access = jar.get("alkeva_access")?.value;
  const refresh = jar.get("alkeva_refresh")?.value;
  if (!access && !refresh) notFound();

  if (access) {
    const base = process.env.API_URL ?? "http://localhost:4000";
    let res: Response | null = null;
    try {
      res = await fetch(`${base}/auth/me`, {
        headers: { authorization: `Bearer ${access}` },
        cache: "no-store",
      });
    } catch {
      res = null; // API unreachable: let the client shell show its own state.
    }
    if (res?.ok) {
      const me = (await res.json()) as MeResponse;
      if (!STAFF.has(me.role)) notFound();
    } else if (res?.status === 401 && !refresh) {
      notFound();
    }
  }

  return <AdminShell>{children}</AdminShell>;
}
