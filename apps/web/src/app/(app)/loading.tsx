import { Skeleton } from "@/components/ui/skeleton";

/** Skeletons that match the final layout — never a spinner in the middle. */
export default function Loading() {
  return (
    <div className="space-y-3.5">
      <Skeleton className="h-[132px] w-full rounded-lg" />
      <Skeleton className="h-[104px] w-full rounded-lg" />
      <Skeleton className="h-[104px] w-full rounded-lg" />
      <Skeleton className="h-[210px] w-full rounded-lg" />
    </div>
  );
}
