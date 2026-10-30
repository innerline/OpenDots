// MWP 2026-10-30T22:0xZ (OpenCode, owner-DM "chat never worked"): token moved
// sessionStorage -> localStorage. sessionStorage dies with every tab close, so
// the owner re-typed the 35-char owner token on EVERY visit and read the wall
// as "chat never worked." Private tailnet + owner-only surface: persisting the
// unlock token is correct here. Set via setToken(); surviving across visits.
let token = localStorage.getItem('opendots-token') ?? '';
export function setToken(value: string) {
  token = value;
  if (value) localStorage.setItem('opendots-token', value);
  else localStorage.removeItem('opendots-token');
}
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    method,
    signal,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(['GET', 'HEAD'].includes(method)
        ? {}
        : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = (await response
    .json()
    .catch(() => ({ error: 'Server returned an unreadable response.' }))) as {
    error?: string;
  };
  if (!response.ok)
    throw new ApiError(
      data.error ?? `Request failed (${response.status}).`,
      response.status,
    );
  return data as T;
}
export function authHeaders(): Record<string, string> {
  return token ? { Authorization: `Bearer ${token}` } : {};
}
