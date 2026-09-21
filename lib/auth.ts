import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Role } from "@/lib/types";

// The signed-in person's profile, or a redirect to /login. Cached per request.
export const requireProfile = cache(async (): Promise<Profile> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/portal/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, email, role, standard_day_hours, is_active")
    .eq("user_id", user.id)
    .maybeSingle();

  // Deactivated staff keep their auth user (history stays intact) but the
  // database hides everything from them, including their own profile.
  if (!profile || !profile.is_active) redirect("/portal/login?error=inactive");

  return profile as Profile;
});

export const isApprover = (role: Role) => role === "approver" || role === "admin";
export const isAdmin = (role: Role) => role === "admin";

export async function requireApprover(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isApprover(profile.role)) redirect("/portal/my/day");
  return profile;
}

export async function requireAdmin(): Promise<Profile> {
  const profile = await requireProfile();
  if (!isAdmin(profile.role)) redirect("/portal/my/day");
  return profile;
}
