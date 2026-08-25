import { redirect } from "next/navigation";
import { isAuthed } from "@/lib/auth";
import Ear from "./Ear";

export const dynamic = "force-dynamic";

export default async function EarPage() {
  if (!(await isAuthed())) redirect("/admin/login");
  return <Ear />;
}
