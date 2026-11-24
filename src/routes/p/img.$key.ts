import { createFileRoute } from "@tanstack/react-router";
import { readPhoto } from "@/server/menu";

// Public: menu photos, and only those.
export const Route = createFileRoute("/p/img/$key")({
  server: {
    handlers: {
      GET: async ({ params }: { params: { key: string } }) => {
        const photo = await readPhoto(params.key);
        if (!photo) return new Response("Not found", { status: 404 });
        return new Response(photo.body, {
          headers: {
            "content-type": photo.httpMetadata?.contentType ?? "image/jpeg",
            "cache-control": "public, max-age=86400",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
