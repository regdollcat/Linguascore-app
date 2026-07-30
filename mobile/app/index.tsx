import { Redirect } from "expo-router";

import { LoadingScreen } from "@/components/loading-screen";
import { useAuth } from "@/lib/auth-context";

export default function IndexScreen() {
  const { isLoading, session } = useAuth();

  if (isLoading) {
    return <LoadingScreen message="Загружаем LinguaScore..." />;
  }

  return <Redirect href={session ? "/home" : "/login"} />;
}
