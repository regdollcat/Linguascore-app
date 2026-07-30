import AsyncStorage from "@react-native-async-storage/async-storage";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { AuthResponse, User } from "@/lib/types";

const SESSION_KEY = "linguascore.session";

type Session = {
  token: string;
  user: User;
};

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const toSession = (response: AuthResponse): Session => ({
  token: response.token,
  user: response.user,
});

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const hydrateSession = async () => {
      try {
        const rawValue = await AsyncStorage.getItem(SESSION_KEY);
        if (!rawValue || !isMounted) {
          return;
        }

        const parsed = JSON.parse(rawValue) as Session;
        const meResponse = await api.me(parsed.token);

        if (!isMounted) {
          return;
        }

        setSession({
          token: parsed.token,
          user: meResponse.user,
        });
      } catch {
        if (isMounted) {
          await AsyncStorage.removeItem(SESSION_KEY);
          setSession(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void hydrateSession();

    return () => {
      isMounted = false;
    };
  }, []);

  const login = async (email: string, password: string) => {
    const authResponse = await api.login({ email, password });
    const nextSession = toSession(authResponse);

    setSession(nextSession);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  };

  const signup = async (name: string, email: string, password: string) => {
    const authResponse = await api.signup({ name, email, password });
    const nextSession = toSession(authResponse);

    setSession(nextSession);
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(nextSession));
  };

  const logout = async () => {
    const currentToken = session?.token;
    setSession(null);
    await AsyncStorage.removeItem(SESSION_KEY);

    if (currentToken) {
      try {
        await api.logout(currentToken);
      } catch {
        // Ignore network errors on logout.
      }
    }
  };

  const value = useMemo(
    () => ({
      session,
      isLoading,
      login,
      signup,
      logout,
    }),
    [isLoading, session]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth должен использоваться внутри AuthProvider");
  }

  return context;
};
