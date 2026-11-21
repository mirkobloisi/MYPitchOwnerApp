const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/**
 * Calls the public `account-security` edge function (forgot password, and the
 * "This wasn't me" lockout from a new-device alert email). Works signed out.
 * Resolves true on success, false when the server refused (for example a link
 * that is expired or already used). Rejects only on network failure.
 */
export async function callAccountSecurity(body: Record<string, string>): Promise<boolean> {
  const response = await fetch(`${supabaseUrl}/functions/v1/account-security`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publishableKey ?? '',
      Authorization: `Bearer ${publishableKey ?? ''}`,
    },
    body: JSON.stringify(body),
  });
  return response.ok;
}
