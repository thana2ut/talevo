import "server-only";

/**
 * VAPID identifies this server to the push services the browsers chose. The
 * public half is also shipped to the browser so it can subscribe; the private
 * half signs each delivery and never leaves the server.
 */
export function getVapidConfiguration() {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:support@talevo.app";

  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

/**
 * Shared secret for the scheduled call that drains the queue. Without it the
 * dispatch route would be an open endpoint that anyone could trigger.
 */
export function getPushDispatchSecret() {
  return process.env.PUSH_DISPATCH_SECRET?.trim() || null;
}
