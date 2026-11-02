import { Suspense } from "react";
import { KycScreen } from "@/components/kyc/kyc-screen";

/* KycScreen reads ?verified=1 (back from Fayda) — app router wants a boundary. */
export default function Page() {
  return (
    <Suspense>
      <KycScreen />
    </Suspense>
  );
}
