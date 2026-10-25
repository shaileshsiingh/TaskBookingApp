import "server-only";

export async function fetchApi<T>(path: string): Promise<T> {
  const baseUrl = (process.env.API_BASE_URL ?? "http://localhost:3000/api").replace(/\/+$/, "");
  const adminKey = process.env.API_ADMIN_KEY;
  if (!adminKey) throw new Error("Admin API key is not configured.");

  const response = await fetch(`${baseUrl}${path}`, {
    cache: "no-store",
    headers: { "x-admin-api-key": adminKey },
  });
  if (!response.ok) throw new Error(`API returned ${response.status} for ${path}`);
  return response.json() as Promise<T>;
}

export const formatPrice = (amount: number) =>
  `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
