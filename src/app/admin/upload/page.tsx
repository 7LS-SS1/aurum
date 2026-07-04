import { redirect } from "next/navigation";

export default async function UploadPage() {
  redirect("/admin/videos/new");
}
