/**
 * The Mini App's start parameter (t.me/<bot>/<app>?startapp=…) is UNTRUSTED
 * input: anyone can craft such a link. It is matched against this allow-list
 * and can do exactly two things — choose which screen opens, or carry a
 * website link token to the server (which validates it). Ownership of any id
 * it names is enforced by the API (another user's id is a 404).
 */
export type StartTarget =
  | { kind: "none" }
  | { kind: "path"; path: string }
  | { kind: "link"; token: string };

const SCREENS: Record<string, string> = {
  trade: "/trade",
  portfolio: "/portfolio",
  history: "/history",
  wallet: "/wallet",
  deposit: "/deposit",
  withdraw: "/withdraw",
  kyc: "/kyc",
  receipts: "/receipts",
  notifications: "/notifications",
  account: "/account",
};

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

export function parseStartParam(raw: string | undefined | null): StartTarget {
  if (!raw || raw.length > 128) return { kind: "none" };
  const link = /^link-([A-Za-z0-9_-]{32,64})$/.exec(raw);
  if (link) return { kind: "link", token: link[1]! };
  const screen = SCREENS[raw];
  if (screen) return { kind: "path", path: screen };
  const deposit = new RegExp(`^deposit-(${UUID})$`).exec(raw);
  if (deposit) return { kind: "path", path: `/deposit/return?id=${deposit[1]}` };
  const receipt = new RegExp(`^receipt-(${UUID})$`).exec(raw);
  if (receipt) return { kind: "path", path: `/receipt/${receipt[1]}` };
  return { kind: "none" };
}
