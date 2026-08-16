import { Suspense } from "react";
import { ResetPasswordScreen } from "@/components/auth/password-reset";

/* useSearchParams (the ?token) requires a Suspense boundary in the app router. */
export default function Page() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
