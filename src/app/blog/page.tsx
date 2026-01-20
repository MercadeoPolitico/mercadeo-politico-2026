import { redirect } from "next/navigation";

export default function BlogPage() {
  // Blog was superseded by the citizen news center.
  redirect("/centro-informativo");
}

