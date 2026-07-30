import { Link, Redirect, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PlayfulBackground } from "@/components/playful-background";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginScreen() {
  const { session, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mascotPulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(mascotPulse, {
          toValue: 1,
          duration: 1400,
          useNativeDriver: true,
        }),
        Animated.timing(mascotPulse, {
          toValue: 0,
          duration: 1400,
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [mascotPulse]);

  if (session) {
    return <Redirect href="/home" />;
  }

  const handleLogin = async () => {
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("Заполните email и пароль");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(email.trim(), password);
      router.replace("/home");
    } catch (unknownError) {
      if (unknownError instanceof ApiError) {
        setError(unknownError.message);
      } else {
        setError("Не удалось войти. Попробуйте ещё раз");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <PlayfulBackground />
      <KeyboardAvoidingView
        style={styles.keyboardAvoiding}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.contentContainer} keyboardShouldPersistTaps="handled">
          <Animated.View
            style={[
              styles.mascot,
              {
                transform: [
                  {
                    scale: mascotPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 1.06],
                    }),
                  },
                ],
              },
            ]}
          >
            <Text style={styles.mascotEmoji}>🗣️</Text>
          </Animated.View>

          <Text style={styles.title}>LinguaScore</Text>
          <Text style={styles.subtitle}>Прокачивай произношение в игровом формате</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor="#6B7280"
              style={styles.input}
            />

            <Text style={styles.label}>Пароль</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              placeholder="Минимум 6 символов"
              placeholderTextColor="#6B7280"
              style={styles.input}
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <Pressable style={styles.primaryButton} onPress={handleLogin} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#042F2E" />
              ) : (
                <Text style={styles.primaryButtonText}>Войти</Text>
              )}
            </Pressable>

            <Link href="/signup" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Создать аккаунт</Text>
              </Pressable>
            </Link>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FDF8ED",
  },
  keyboardAvoiding: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    paddingTop: 24,
  },
  mascot: {
    alignSelf: "center",
    width: 90,
    height: 90,
    borderRadius: 90,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFF7CC",
    marginBottom: 10,
  },
  mascotEmoji: {
    fontSize: 42,
  },
  title: {
    textAlign: "center",
    fontSize: 34,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 6,
    textAlign: "center",
    color: "#334155",
    fontSize: 16,
    marginBottom: 22,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    shadowColor: "#0F172A",
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 7 },
    elevation: 8,
    gap: 8,
  },
  label: {
    color: "#0F172A",
    fontWeight: "700",
    marginTop: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#F8FAFC",
    color: "#0F172A",
  },
  error: {
    color: "#B91C1C",
    marginTop: 4,
    fontWeight: "600",
  },
  primaryButton: {
    marginTop: 10,
    borderRadius: 14,
    backgroundColor: "#5EEAD4",
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#042F2E",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryButton: {
    marginTop: 6,
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 15,
  },
});
