import { AdminUserDetailScreen } from "@/components/admin/user-detail-screen";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminUserDetailScreen userId={id} />;
}
