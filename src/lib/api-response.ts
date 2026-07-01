import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ValidationError } from "./validation";

/**
 * Central error → HTTP mapping so route handlers never do
 * `res.json({ error: e.message })` and accidentally leak stack traces,
 * SQL fragments, or internal file paths to the client.
 */
export function apiError(err: unknown, fallbackStatus = 500): NextResponse {
  if (err instanceof ZodError) {
    return NextResponse.json(
      { error: "validation_failed", issues: err.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 422 },
    );
  }
  if (err instanceof ValidationError) {
    return NextResponse.json({ error: err.message }, { status: 400 });
  }
  if (err instanceof ApiError) {
    return NextResponse.json({ error: err.message }, { status: err.status });
  }

  console.error(err);
  const message = fallbackStatus >= 500 ? "internal_server_error" : "request_failed";
  return NextResponse.json({ error: message }, { status: fallbackStatus });
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export function jsonOk<T>(data: T, init?: number | ResponseInit) {
  return NextResponse.json(data, typeof init === "number" ? { status: init } : init);
}
