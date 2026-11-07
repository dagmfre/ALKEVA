import { Mark } from "@/components/brand/mark";

/** The narrow frame every pre-sign-in Mini App screen sits in. */
export function TgFrame({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5">
        <Mark size={30} />
        <span className="font-latin text-[0.9375rem] font-extrabold tracking-[0.22em]">ALKEVA</span>
      </div>
      {children}
    </main>
  );
}
