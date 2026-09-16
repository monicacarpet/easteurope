import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { demoMode, supabase } from "lib/supabase";

const AuthContext = createContext(null);

const DEMO_PROFILE = {
  id: "demo-admin",
  email: "admin@platform-demo.local",
  full_name: "Demo Administrator",
  role: "bi_admin",
  active: true,
};

const ADMIN_ROLES = new Set(["ceo", "business_gm", "bi_admin"]);
const ANALYTICS_ROLES = new Set(["ceo", "business_gm", "bi_admin", "bi_partial", "sales_manager"]);

async function fetchApplicationProfile(userId) {
  const { data, error } = await supabase
    .from("app_profiles")
    .select("id,email,full_name,role,active")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new Error("Your login is valid, but no application profile exists for this user.");
  }
  if (!data.active) {
    throw new Error("This application account is inactive.");
  }

  return data;
}

export function AuthProvider({ children }) {
  const [session, setSession] = useState(demoMode ? { user: { id: DEMO_PROFILE.id } } : null);
  const [profile, setProfile] = useState(demoMode ? DEMO_PROFILE : null);
  const [loading, setLoading] = useState(!demoMode);
  const sessionRef = useRef(session);
  const profileRef = useRef(profile);

  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (demoMode || !supabase) return undefined;

    let mounted = true;

    async function hydrateSession(nextSession) {
      if (!nextSession?.user) {
        if (mounted) {
          sessionRef.current = null;
          profileRef.current = null;
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
        return;
      }

      const nextProfile = await fetchApplicationProfile(nextSession.user.id);

      if (mounted) {
        sessionRef.current = nextSession;
        profileRef.current = nextProfile;
        setSession(nextSession);
        setProfile(nextProfile);
        setLoading(false);
      }
    }

    supabase.auth.getSession().then(({ data, error }) => {
      if (!mounted) return;

      if (error) {
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      hydrateSession(data.session).catch(() => {
        if (mounted) {
          setSession(null);
          setProfile(null);
          setLoading(false);
        }
      });
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      // getSession() above owns initial hydration. Ignoring INITIAL_SESSION here
      // prevents a duplicate profile fetch and an unnecessary loading transition.
      if (event === "INITIAL_SESSION") return;

      if (!nextSession?.user) {
        sessionRef.current = null;
        profileRef.current = null;
        setSession(null);
        setProfile(null);
        setLoading(false);
        return;
      }

      const currentUserId = sessionRef.current?.user?.id;
      const currentProfile = profileRef.current;
      const sameAuthenticatedUser =
        currentUserId === nextSession.user.id &&
        currentProfile?.id === nextSession.user.id &&
        currentProfile?.active;

      // Supabase can emit SIGNED_IN again when a browser tab regains focus and
      // TOKEN_REFRESHED when it renews the JWT. These are not new logins.
      // Updating the session silently keeps protected routes mounted, so open
      // dialogs, table state and page state are preserved across tab switches.
      if (
        sameAuthenticatedUser &&
        (event === "SIGNED_IN" || event === "TOKEN_REFRESHED")
      ) {
        sessionRef.current = nextSession;
        setSession(nextSession);
        setLoading(false);
        return;
      }

      // Only block the whole application when there is no usable profile yet.
      // Profile/user updates for the same signed-in user are refreshed silently.
      if (!sameAuthenticatedUser) setLoading(true);

      // Important: do not call other Supabase methods synchronously inside
      // onAuthStateChange. Deferring the profile lookup prevents the auth-lock
      // deadlock that made a valid login stay on "Signing in..." indefinitely.
      window.setTimeout(() => {
        hydrateSession(nextSession).catch(() => {
          if (mounted) {
            sessionRef.current = null;
            profileRef.current = null;
            setSession(null);
            setProfile(null);
            setLoading(false);
          }
        });
      }, 0);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const role = profile?.role || "sales_rep";

    return {
      session,
      profile,
      loading,
      demoMode,
      isAuthenticated: Boolean(session && profile?.active),
      isAdmin: ADMIN_ROLES.has(role),
      canViewAnalytics: ANALYTICS_ROLES.has(role),
      canManageStock: ADMIN_ROLES.has(role),
      canManageUsers: ADMIN_ROLES.has(role),
      async signIn(email, password) {
        if (demoMode) {
          const demoSession = { user: { id: DEMO_PROFILE.id } };
          sessionRef.current = demoSession;
          profileRef.current = DEMO_PROFILE;
          setSession(demoSession);
          setProfile(DEMO_PROFILE);
          return;
        }

        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data.session?.user) throw new Error("Supabase did not return a valid session.");

        try {
          const nextProfile = await fetchApplicationProfile(data.session.user.id);
          sessionRef.current = data.session;
          profileRef.current = nextProfile;
          setSession(data.session);
          setProfile(nextProfile);
          setLoading(false);
        } catch (profileError) {
          await supabase.auth.signOut();
          throw profileError;
        }
      },
      async signOut() {
        if (demoMode) return;
        await supabase.auth.signOut();
      },
    };
  }, [session, profile, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

AuthProvider.propTypes = { children: PropTypes.node.isRequired };

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
