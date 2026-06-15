import { type NextRequest, NextResponse } from "next/server";
import { TOKEN_COOKIE } from "@/lib/auth";
import { logger } from "@/lib/logger";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:6769";
const TOKEN_MAX_AGE = 8 * 3600;

const proxy = async (request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) => {
  const { path } = await params;
  const url = `${BACKEND_URL}/${path.join("/")}${request.nextUrl.search}`;

  const isBodyless = request.method === "GET" || request.method === "HEAD";
  const body = isBodyless ? undefined : await request.arrayBuffer();

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!["host", "connection", "transfer-encoding"].includes(key.toLowerCase())) {
      headers.set(key, value);
    }
  });

  // If the client didn't supply a Bearer token explicitly, inject it from the
  // HttpOnly cookie so the backend always receives a valid Authorization header.
  if (!headers.get("authorization")) {
    const cookieToken = request.cookies.get(TOKEN_COOKIE)?.value;
    if (cookieToken) headers.set("authorization", `Bearer ${cookieToken}`);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: request.method,
      headers,
      body: body && body.byteLength > 0 ? body : undefined,
      cache: "no-store",
    });
  } catch (err) {
    logger.error("Backend fetch failed: %s %s →", request.method, url, err);
    return NextResponse.json({ detail: "Backend unavailable" }, { status: 503 });
  }

  if (response.status >= 500) {
    logger.error("Backend returned %d for %s %s", response.status, request.method, url);
  }

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

  // On a successful login response, extract the JWT and set it as an HttpOnly
  // cookie so client-side JavaScript cannot read or steal it.
  const isLoginPath = path.join("/") === "auth/login" && request.method === "POST";
  if (isLoginPath && response.status === 200) {
    try {
      const clone = response.clone();
      const json = await clone.json() as { access_token?: string };
      if (json.access_token) {
        responseHeaders.set(
          "set-cookie",
          `${TOKEN_COOKIE}=${encodeURIComponent(json.access_token)}; Path=/; Max-Age=${TOKEN_MAX_AGE}; SameSite=Strict; HttpOnly`,
        );
      }
    } catch {
      // Leave cookie unset if body can't be parsed — the client fallback still works.
    }
  }

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
  });
};

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
export const PATCH = proxy;
