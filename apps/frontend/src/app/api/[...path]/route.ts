import { type NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:6769";

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

  const response = await fetch(url, {
    method: request.method,
    headers,
    body: body && body.byteLength > 0 ? body : undefined,
    cache: "no-store",
  });

  const responseHeaders = new Headers();
  response.headers.forEach((value, key) => {
    if (!["transfer-encoding", "connection"].includes(key.toLowerCase())) {
      responseHeaders.set(key, value);
    }
  });

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
