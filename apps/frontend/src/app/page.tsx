import { redirect } from "next/navigation";

// `/` is now a redirect to the public map. Login is a modal opened from
// the header on /dashboard or any gated content.
export default function HomePage() {
  redirect("/dashboard");
}
