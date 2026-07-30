import { Link, Redirect, router } from "expo-router";
import { useState } from "react";
import {
  ActivityIndicator,
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

export default function SignupScreen() {
  const { session, signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (session) {
    return <Redirect href="/home" />;
  }

  const handleSignup = async () => {
    setError("");

    if (!name.trim() || !email.trim() || !password.trim()) {
      setError("Заполните все поля");
      return;
    }

    if (password.trim().length < 6) {
      setError("Пароль должен быть минимум из 6 символов");
      return;
    }

    setIsSubmitting(true);
    try {
      await signup(name.trim(), email.trim(), password.trim());
      router.replace("/home");
    } catch (unknownError) {
      if (unknownError instanceof ApiError) {
        setError(unknownError.message);
      } else {
        setError("Не удалось создать аккаунт. Попробуйте позже");
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
          <Text style={styles.title}>Новый игрок</Text>
          <Text style={styles.subtitle}>Создай аккаунт и начни первые 10 слов уже сейчас</Text>

          <View style={styles.card}>
            <Text style={styles.label}>Имя</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Как к вам обращаться?"
              placeholderTextColor="#6B7280"
              style={styles.input}
            />

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

            <Pressable style={styles.primaryButton} onPress={handleSignup} disabled={isSubmitting}>
              {isSubmitting ? (
                <ActivityIndicator color="#3F1D12" />
              ) : (
                <Text style={styles.primaryButtonText}>Зарегистрироваться</Text>
              )}
            </Pressable>

            <Link href="/login" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>У меня уже есть аккаунт</Text>
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
  title: {
    textAlign: "center",
    fontSize: 34,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 16,
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
    backgroundColor: "#FDBA74",
    paddingVertical: 13,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#3F1D12",
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
