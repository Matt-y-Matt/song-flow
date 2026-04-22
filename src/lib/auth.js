import { supabase } from './supabase.js';

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session || null;
}

export async function getUser() {
  const { data } = await supabase.auth.getUser();
  return data.user || null;
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
  return () => data.subscription.unsubscribe();
}

export async function signInWithGoogle() {
  const redirectTo = window.location.origin;
  return supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  });
}

export async function signInWithMagicLink(email) {
  const redirectTo = window.location.origin;
  return supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo },
  });
}

export async function signOut() {
  return supabase.auth.signOut();
}
