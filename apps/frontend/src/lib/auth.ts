export const TOKEN_COOKIE = "auth_token";

export type AuthUser = {
  sub: string;
  username: string;
  roles: string[];
  team_id: number | null;
};

export const getToken = (): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${TOKEN_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

export const setToken = (token: string) => {
  document.cookie = `${TOKEN_COOKIE}=${encodeURIComponent(token)}; path=/; max-age=${8 * 3600}; SameSite=Strict`;
};

export const clearToken = () => {
  document.cookie = `${TOKEN_COOKIE}=; path=/; max-age=0`;
};

export const parseToken = (token: string): AuthUser | null => {
  try {
    return JSON.parse(atob(token.split(".")[1])) as AuthUser;
  } catch {
    return null;
  }
};
