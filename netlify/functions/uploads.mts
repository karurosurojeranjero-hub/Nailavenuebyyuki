// Serves design-inspiration photos that customers attach to bookings (stored in Netlify Blobs).
import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

export default async (req: Request, context: Context) => {
  const file = context.params.file;
  if (!/^[a-f0-9]{24}\.jpg$/.test(file || "")) return new Response("Not found", { status: 404 });
  const data = await getStore("uploads").get(file, { type: "arrayBuffer" });
  if (!data) return new Response("Not found", { status: 404 });
  return new Response(data, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800" } });
};

export const config: Config = { path: "/uploads/:file" };
