import { Suspense } from "react";
import { DepositReturnScreen } from "@/components/money/deposit-return-screen";

/** useSearchParams requires a Suspense boundary in the app router. */
export default function Page() {
  return (
    <Suspense>
      <DepositReturnScreen />
    </Suspense>
  );
}
