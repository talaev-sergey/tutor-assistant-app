export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function getAuthHeader(): string {
  const jwt = localStorage.getItem('classroom_jwt');
  if (jwt) return `Bearer ${jwt}`;
  const initData = window.Telegram?.WebApp?.initData;
  if (initData) return `tma ${initData}`;
  return '';
}

export async function apiFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const isFormData = opts.body instanceof FormData;
  const res = await fetch(path, {
    ...opts,
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      Authorization: getAuthHeader(),
      ...(opts.headers as Record<string, string> | undefined),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, `${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}
