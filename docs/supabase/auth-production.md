# TALEVO Supabase Auth production setup

## Required server-only configuration

Account deletion uses the Supabase Admin API from a Next.js Route Handler. Configure this variable only in the server/deployment environment:

```text
SUPABASE_SECRET_KEY=<Supabase secret key for talevo-sg>
```

- Never prefix it with `NEXT_PUBLIC_`.
- Never expose it in browser code, logs, screenshots, or commits.
- Do not replace the existing publishable key with this key.
- Restart the Next.js server after adding or rotating the variable.
- `SUPABASE_SERVICE_ROLE_KEY` is accepted temporarily as a legacy fallback, but `SUPABASE_SECRET_KEY` always has priority when both exist.

Without this variable, account deletion fails closed with HTTP 503 and TALEVO keeps all local data unchanged.

## Supabase Auth URL configuration

In Supabase Dashboard → Authentication → URL Configuration:

1. Set the production Site URL to the deployed TALEVO origin.
2. Add the following Redirect URLs for each environment that will be tested:
   - `http://localhost:3000/auth/confirm`
   - `<production-origin>/auth/confirm`
3. Keep email confirmation enabled or disabled according to the release policy, then test the matching flow.

TALEVO sends signup and password-recovery links through `/auth/confirm`. The callback accepts only `/today` and `/reset-password` as destinations.

## Release verification

- Use QA-only email accounts that can receive confirmation and recovery messages.
- Verify `auth.users`, `public.profiles`, and `public.academic_terms` for the new QA signup.
- Verify invalid, expired, and reused callback links.
- Verify account deletion only after `SUPABASE_SECRET_KEY` is configured server-side.
- Confirm that the deleted auth user and cascade-owned rows are gone.
- Confirm that only the deleted account's namespaced local state and referenced attachments are removed.
- Do not enable Local → Cloud upload; `readyForUpload` must remain `false`.
