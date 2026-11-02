import { Suspense } from "react";
import { FaydaCallbackScreen } from "@/components/auth/fayda-callback";

/**
 * Fayda (VeriFayda 2.0 / eSignet) redirect target. The path must match the
 * redirect URI registered for the client EXACTLY — the public sandbox clients
 * are registered for http://localhost:3000/callback.
 */
export default function Page() {
  return (
    <Suspense>
      <FaydaCallbackScreen />
    </Suspense>
  );
}
