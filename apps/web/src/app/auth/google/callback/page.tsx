import { Suspense } from "react";
import { GoogleCallbackScreen } from "@/components/auth/google-callback";

export default function Page() {
  return (
    <Suspense>
      <GoogleCallbackScreen />
    </Suspense>
  );
}
