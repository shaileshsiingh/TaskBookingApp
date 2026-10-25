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
  redirect("/bookings");
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
    redirect(`/providers?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/providers");
  redirect("/providers?notice=provider-created");
}

export async function setProviderVerification(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const providerId = formData.get("providerId");
  const verified = formData.get("verified");
  if (typeof providerId !== "string" || !["true", "false"].includes(String(verified))) {
    redirect("/providers?error=invalid-provider-action");
  }

  try {
    await requestAdminApi(
      `/providers/${encodeURIComponent(providerId)}/verification`,
      "PATCH",
      { verified: verified === "true" },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update provider.";
    redirect(`/providers?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/providers");
  redirect("/providers?notice=provider-updated");
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
    redirect("/bookings?error=invalid-assignment");
  }

  try {
    await requestAdminApi(
      `/bookings/${encodeURIComponent(bookingId)}/assignments`,
      "POST",
      { providerId, requirementId },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not assign provider.";
    redirect(`/bookings?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/bookings");
  redirect("/bookings?notice=provider-assigned");
}

export async function createCategory(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  try {
    await requestAdminApi("/admin/categories", "POST", {
      name: formData.get("name"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create category.";
    redirect(`/services?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/services");
  redirect("/services?notice=category-created");
}

export async function updateCategory(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const categoryId = formData.get("categoryId");
  const active = formData.get("active");
  if (typeof categoryId !== "string" || !["true", "false"].includes(String(active))) {
    redirect("/services?error=invalid-category-action");
  }

  try {
    await requestAdminApi(`/admin/categories/${encodeURIComponent(categoryId)}`, "PATCH", {
      active: active === "true",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update category.";
    redirect(`/services?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/services");
  redirect("/services?notice=category-updated");
}

export async function createService(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  try {
    await requestAdminApi("/admin/services", "POST", {
      categoryId: formData.get("categoryId"),
      name: formData.get("name"),
      description: formData.get("description"),
      pricingModel: formData.get("pricingModel"),
      price: formData.get("price"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not create service.";
    redirect(`/services?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/services");
  redirect("/services?notice=service-created");
}

export async function updateService(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const serviceId = formData.get("serviceId");
  if (typeof serviceId !== "string") {
    redirect("/services?error=invalid-service-action");
  }

  try {
    await requestAdminApi(`/admin/services/${encodeURIComponent(serviceId)}`, "PATCH", {
      price: formData.get("price"),
      pricingModel: formData.get("pricingModel"),
      active: formData.get("active") === "true",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not update service.";
    redirect(`/services?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/services");
  redirect("/services?notice=service-updated");
}

export async function resolveDispute(formData: FormData) {
  if (!(await isAdminSessionValid())) redirect("/?error=admin-session");

  const orderId = formData.get("orderId");
  const action = formData.get("action");
  if (typeof orderId !== "string" || !["refund", "dismiss"].includes(String(action))) {
    redirect("/disputes?error=invalid-dispute-action");
  }

  try {
    await requestAdminApi(`/admin/orders/${encodeURIComponent(orderId)}/dispute-resolution`, "PATCH", {
      action,
      refundAmount: formData.get("refundAmount"),
      note: formData.get("note"),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not resolve this dispute.";
    redirect(`/disputes?error=${encodeURIComponent(message)}`);
  }

  revalidatePath("/disputes");
  redirect(
    `/disputes?notice=${action === "refund" ? "dispute-refunded" : "dispute-dismissed"}`,
  );
}
