import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import { NEWS_CATEGORIES } from "@/lib/config";
import Dashboard from "./Dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  if (!(await isAuthed())) redirect("/admin/login");
  return <Dashboard categories={NEWS_CATEGORIES} />;
}
