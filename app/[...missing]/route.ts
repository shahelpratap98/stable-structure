import { NextResponse, type NextRequest } from "next/server";
import { hitMemory, ipFrom } from "@/lib/rate-limit-memory";

// Anything that is neither a static page nor a portal route lands here.
// Serve the website's own branded 404 page, with a real 404 status so search
// engines drop the URL (a rewrite to /404.html would answer 200).
async function notFound(request: NextRequest) {
  let html = "<!doctype html><title>Page not found</title><h1>Page not found</h1><p><a href=\"/\">Back to the home page</a></p>";
  // A scanner probing random URLs gets the plain version, not a page fetch each time.
  const calm = hitMemory(`404:${ipFrom(request.headers)}`, 30, 60).ok;
  try {
    if (!calm) throw new Error("rate limited");
    const page = await fetch(new URL("/404.html", request.url), { cache: "force-cache" });
    if (page.ok) html = await page.text();
  } catch {
    // fall back to the plain message above
  }
  return new NextResponse(html, {
    status: 404,
    headers: { "Content-Type": "text/html; charset=utf-8", "X-Robots-Tag": "noindex" },
  });
}

export { notFound as GET, notFound as HEAD, notFound as POST };
