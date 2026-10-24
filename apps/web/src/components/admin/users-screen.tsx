"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { AdminUserItem } from "@alkeva/shared";

import { AdminSearch, AdminTable, StatusBadge, Td } from "@/components/admin/ui";
import { eatStamp } from "@/lib/format";
import { useResource } from "@/lib/use-resource";

/** Every account, searchable by email or name; each row opens its detail. */
export function AdminUsersScreen() {
  const t = useTranslations("admin");
  const [query, setQuery] = useState("");
  const [applied, setApplied] = useState("");
  const { data, loading } = useResource<{ users: AdminUserItem[] }>(
    `/admin/users${applied ? `?q=${encodeURIComponent(applied)}` : ""}`,
  );
  const users = data?.users ?? [];

  return (
    <div className="flex flex-col gap-3">
      <h1 className="sr-only">{t("nav.users")}</h1>
      <AdminTable
        title={t("nav.users")}
        hint={loading ? undefined : <span className="tnum">{users.length}</span>}
        action={
          <AdminSearch
            value={query}
            onChange={setQuery}
            onSubmit={() => setApplied(query.trim())}
            placeholder={t("users.searchPlaceholder")}
          />
        }
        loading={loading}
        headers={[
          t("users.email"),
          t("users.name"),
          t("users.role"),
          t("users.status"),
          { label: t("users.kycTier"), end: true },
          { label: t("users.joined"), end: true },
        ]}
      >
        {users.map((u) => (
          <tr key={u.id}>
            <Td>
              <Link
                href={`/admin/users/${u.id}`}
                className="font-medium text-gold-300 underline-offset-4 hover:text-gold-300 hover:underline"
              >
                {u.email}
              </Link>
            </Td>
            <Td>{u.fullName}</Td>
            <Td className="text-muted-foreground">{t(`roles.${u.role}` as never)}</Td>
            <Td>
              <StatusBadge
                status={u.status === "frozen" ? "frozen" : "active"}
                label={u.status === "frozen" ? t("users.frozen") : t("users.active")}
              />
            </Td>
            <Td className="tnum text-end">{u.kycTier}</Td>
            <Td className="tnum text-end text-[0.75rem] whitespace-nowrap text-subtle">{eatStamp(u.createdAt)}</Td>
          </tr>
        ))}
      </AdminTable>
    </div>
  );
}
