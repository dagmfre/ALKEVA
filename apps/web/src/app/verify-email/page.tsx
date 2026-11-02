import { Suspense } from "react";
import { VerifyEmailScreen } from "@/components/auth/verify-email";

export default function Page() {
  return (
    <Suspense>
      <VerifyEmailScreen />
    </Suspense>
  );
}
