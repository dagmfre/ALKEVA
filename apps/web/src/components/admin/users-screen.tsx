"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AdminUserItem } from "@alkeva/shared";

import { AdminTable, Td } from "@/components/admin/ui";
import { Skeleton } from "@/components/ui/skeleton";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";
import { cn } from "@/lib/utils";

export function AdminUsersScreen() {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading } = useResource<{ users: AdminUserItem[] }>(
    `/admin/users${applied ? `?q=${encodeURIComponent(applied)}` : ""}`,
  );

  return (
    <div>
      <h1 className="mb-4 text-xl font-semibold">{t("nav.users")}</h1>
      <form
        className="mb-4 flex max-w-[420px] gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("users.searchPlaceholder")}
          className="well min-h-11 w-full rounded-md px-3 text-[0.9375rem] outline-none"
        />
      </form>

      {loading ? (
        <Skeleton className="h-48 rounded-lg" />
      ) : (
        <AdminTable
          headers={[
            t("users.email"),
            t("users.name"),
            t("users.role"),
            t("users.status"),
            t("users.kycTier"),
            t("users.joined"),
          ]}
        >
          {(data?.users ?? []).map((u) => (
            <tr key={u.id} className="hover:bg-popover/40">
              <Td>
                <Link href={`/admin/users/${u.id}`} className="font-latin text-gold-400 hover:text-gold-300">
                  {u.email}
                </Link>
              </Td>
              <Td>{u.fullName}</Td>
              <Td className="text-muted-foreground">{t(`roles.${u.role}` as never)}</Td>
              <Td>
                <span className={cn(u.status === "frozen" ? "text-loss" : "text-gain")}>
                  {u.status === "frozen" ? `✕ ${t("users.frozen")}` : `✓ ${t("users.active")}`}
                </span>
              </Td>
              <Td className="tnum">{u.kycTier}</Td>
              <Td className="font-latin text-[0.8125rem] text-subtle">{eatStamp(u.createdAt)}</Td>
            </tr>
          ))}
        </AdminTable>
      )}
    </div>
  );
}
