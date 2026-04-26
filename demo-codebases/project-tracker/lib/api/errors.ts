export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
    this.name = "ApiError";
  }

  get isNotFound(): boolean {
    return this.status === 404;
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  get isForbidden(): boolean {
    return this.status === 403;
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export function errorResponse(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

export function notFound(message = "Not found"): Response {
  return errorResponse(message, 404);
}

export function badRequest(message: string): Response {
  return errorResponse(message, 400);
}

export function unauthorized(): Response {
  return errorResponse("Unauthorized", 401);
}
