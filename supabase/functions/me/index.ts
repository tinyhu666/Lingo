import { createClient } from 'npm:@supabase/supabase-js@2';

Deno.serve(async (req) => {
  const authHeader = req.headers.get('Authorization') || '';
  const token = authHeader.replace('Bearer ', '').trim();
  if (!token) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const supabaseAnon = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const admin = createClient(supabaseUrl, supabaseAnon, {
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });

  const { data: userData, error: userError } = await admin.auth.getUser();
  if (userError || !userData?.user) {
    return new Response(JSON.stringify({ message: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user = userData.user;
  const emailVerified = Boolean(user.email_confirmed_at || user.confirmed_at);

  let role = 'user';
  let quota: unknown = null;

  const { data: profile } = await admin
    .from('profiles')
    .select('role,email_verified,quota')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'admin') {
    role = 'admin';
  }
  if (profile && typeof profile.quota !== 'undefined') {
    quota = profile.quota;
  }

  // Keep profile email_verified aligned with auth state when table exists.
  if (profile && profile.email_verified !== emailVerified) {
    await admin
      .from('profiles')
      .update({ email_verified: emailVerified })
      .eq('id', user.id);
  }

  return new Response(
    JSON.stringify({
      user_id: user.id,
      email: user.email,
      role,
      email_verified: emailVerified,
      quota,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
});
