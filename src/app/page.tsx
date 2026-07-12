import { redirect } from "next/navigation";

// Root page - redirects to sign-in
export default function Home() {
  redirect("/sign-in");
}
