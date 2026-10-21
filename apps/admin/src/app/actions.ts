"use server";

import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { clearAdminSession, createAdminSession, isAdminSessionValid } from "./admin-auth";

async function requestAdminApi(path: string, method: "POST" | "PATCH", body?: unknown) {
  const apiKey = process.env.API_ADMIN_KEY;
  if (!apiKey) throw new Error("Admin API key is not configured.");

  const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      "x-admin-api-key": apiKey,
    },
    body: JSON.stringify(body ?? {}),
  });

  if (!response.ok) {
    const text = await response.text();
    let message = `Request failed (${response.status}).`;
    try {
      const result = JSON.parse(text) as { message?: string | string[] };
      message = Array.isArray(result.message)
        ? result.message.join(" ")
        : result.message ?? message;
    } catch {
      message = `Request failed (${response.status}).`;
    }
    throw new Error(message);
  }
}

export async function loginAdmin(formData: FormData) {
  const expectedKey = process.env.API_ADMIN_KEY;
  const suppliedKey = formData.get("key");
  if (!expectedKey || typeof suppliedKey !== "string") {
    redirect("/?error=admin-login");
  }

  const expectedBytes = Buffer.from(expectedKey);
  const suppliedBytes = Buffer.from(suppliedKey);
  if (
    expectedBytes.length !== suppliedBytes.length ||
    !timingSafeEqual(expectedBytes, suppliedBytes)
  ) {
    redirect("/?error=admin-login");
  }

  await createAdminSession(expectedKey);
  redirect("/");
}

export async function logoutAdmin() {
  await clearAdminSession();
  redirect("/");
}

export async function createProvider(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  try {
    await requestAdminApi("/providers", "POST", {
      name: formData.get("name"),
      phone: formData.get("phone"),
      serviceArea: formData.get("serviceArea"),
      serviceIds: formData.getAll("serviceIds"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create provider.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  redirect("/?notice=provider-created");
}

export async function setProviderVerification(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const providerId = formData.get("providerId");
  const verified = formData.get("verified");
  if (typeof providerId !== "string" || !["true", "false"].includes(String(verified))) {
    redirect("/?error=invalid-provider-action");
  }

  try {
    await requestAdminApi(
      `/providers/${encodeURIComponent(providerId)}/verification`,
      "PATCH",
      { verified: verified === "true" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update provider.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  redirect("/?notice=provider-updated");
}

export async function assignProvider(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const bookingId = formData.get("bookingId");
  const providerId = formData.get("providerId");
  const requirementId = formData.get("requirementId");
  if (
    typeof bookingId !== "string" ||
    typeof providerId !== "string" ||
    typeof requirementId !== "string"
  ) {
    redirect("/?error=invalid-assignment");
  }

  try {
    await requestAdminApi(
      `/bookings/${encodeURIComponent(bookingId)}/assignments`,
      "POST",
      { providerId, requirementId },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not assign provider.";
    redirect(`/?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/");
  redirect("/?notice=provider-assigned");
}
