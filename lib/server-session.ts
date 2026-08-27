import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import {
  AppError,
  capabilitiesFor,
  type Capabilities,
  type Role,
} from "./contracts";
import { ensureWikiSchema, getMembership } from "../db/wiki-repository";

export type WikiSession = {
  email: string;
  displayName: string;
  wikiId: string | null;
  wikiTitle: string | null;
  role: Role | null;
  capabilities: Capabilities;
  siteVersion: number;
};

export async function getWikiSession(): Promise<WikiSession> {
  await ensureWikiSchema();
  const authenticatedUser = await getChatGPTUser();
  const user =
    authenticatedUser ??
    (process.env.NODE_ENV !== "production"
      ? {
          userId: "local-sites-user",
          email: "seedy@sites.test",
          displayName: "Local Sites User",
          fullName: "Local Sites User",
        }
      : null);
  if (!user)
    throw new AppError(
      "unauthenticated",
      "Sign in with ChatGPT to use this wiki.",
      401,
    );
  const email = user.email.trim().toLowerCase();
  if (!email)
    throw new AppError(
      "unauthenticated",
      "The signed-in identity has no usable email address.",
      401,
    );
  const membership = await getMembership(email);
  const configuredOwner = (env.BOOTSTRAP_OWNER_EMAIL ?? "")
    .trim()
    .toLowerCase();
  const localOwner =
    process.env.NODE_ENV !== "production" && email.endsWith("@sites.test");
  const canBootstrap =
    membership.bootstrapStatus === "empty" &&
    (configuredOwner === email || localOwner);
  return {
    email,
    displayName: user.displayName,
    wikiId: membership.wikiId,
    wikiTitle: membership.wikiTitle,
    role: membership.role,
    capabilities: capabilitiesFor(membership.role, canBootstrap),
    siteVersion: membership.siteVersion,
  };
}

export async function requireWikiSession(
  capability: keyof Capabilities,
): Promise<WikiSession> {
  const session = await getWikiSession();
  if (!session.capabilities[capability])
    throw new AppError(
      "forbidden",
      "Your current wiki role does not allow this action.",
      403,
      { capability },
    );
  if (capability !== "can_bootstrap" && !session.wikiId)
    throw new AppError(
      "not_found",
      "There is no active wiki for this session.",
      404,
    );
  return session;
}

export async function requireImportAuthority(): Promise<WikiSession> {
  const session = await getWikiSession();
  if (!session.capabilities.can_import && !session.capabilities.can_bootstrap)
    throw new AppError(
      "forbidden",
      "Only the current owner or authorized bootstrap identity can import a wiki.",
      403,
    );
  return session;
}
