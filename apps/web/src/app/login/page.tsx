import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

/* AuthForm reads searchParams (?reset=1) — app router wants a boundary. */
export default function LoginPage() {
  return (
    <Suspense>
      <AuthForm mode="login" />
    </Suspense>
  );
}
