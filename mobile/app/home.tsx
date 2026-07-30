import { Redirect, router } from "expo-router";
import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { PlayfulBackground } from "@/components/playful-background";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Assessment, HistoryItem } from "@/lib/types";

const formatDate = (isoString: string): string =>
  new Date(isoString).toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function HomeScreen() {
  const { session, logout } = useAuth();
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeAssessment, setActiveAssessment] = useState<Assessment | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    if (!session?.token) {
      return;
    }

    setIsRefreshing(true);
    setError("");

    try {
      const [historyResponse, activeResponse] = await Promise.all([
        api.history(session.token),
        api.activeAssessment(session.token),
      ]);

      setHistory(historyResponse.items);
      setActiveAssessment(activeResponse.assessment);
    } catch {
      setError("Не удалось загрузить историю. Проверьте подключение к backend");
    } finally {
      setIsRefreshing(false);
    }
  }, [session?.token]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const averageScore = useMemo(() => {
    if (history.length === 0) {
      return 0;
    }

    const sum = history.reduce((acc, item) => acc + item.totalScore, 0);
    return Number((sum / history.length).toFixed(1));
  }, [history]);

  if (!session) {
    return <Redirect href="/login" />;
  }

  const startOrResumeAssessment = async () => {
    if (!session.token) {
      return;
    }

    setIsStarting(true);
    setError("");

    try {
      if (!activeAssessment) {
        await api.startAssessment(session.token);
      }

      router.push("/assessment");
    } catch {
      setError("Не удалось начать оценку");
    } finally {
      setIsStarting(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <PlayfulBackground />
      <ScrollView
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={() => void loadData()} />}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>Привет, {session.user.name}!</Text>
            <Text style={styles.subtitle}>Готов к новой тренировке произношения?</Text>
          </View>

          <Pressable style={styles.logoutButton} onPress={handleLogout}>
            <Text style={styles.logoutText}>Выйти</Text>
          </Pressable>
        </View>

        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Твоя статистика</Text>
          <View style={styles.statsRow}>
            <View>
              <Text style={styles.statsLabel}>Попыток</Text>
              <Text style={styles.statsValue}>{history.length}</Text>
            </View>
            <View>
              <Text style={styles.statsLabel}>Средний балл</Text>
              <Text style={styles.statsValue}>{averageScore}</Text>
            </View>
          </View>
        </View>

        <Pressable style={styles.startButton} onPress={startOrResumeAssessment} disabled={isStarting}>
          {isStarting ? (
            <ActivityIndicator color="#172554" />
          ) : (
            <Text style={styles.startButtonText}>
              {activeAssessment ? "Продолжить текущую оценку" : "Начать новую оценку"}
            </Text>
          )}
        </Pressable>

        {activeAssessment ? (
          <View style={styles.activeCard}>
            <Text style={styles.activeTitle}>Есть незавершённая попытка</Text>
            <Text style={styles.activeText}>
              Текущая позиция: {activeAssessment.nextPosition !== null ? activeAssessment.nextPosition + 1 : 10}/10
            </Text>
          </View>
        ) : null}

        <Text style={styles.historyTitle}>История оцениваний</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        {history.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateTitle}>Пока нет попыток</Text>
            <Text style={styles.emptyStateText}>Нажми кнопку выше и пройди первую оценку из 10 слов</Text>
          </View>
        ) : (
          history.map((item) => (
            <View key={item.id} style={styles.historyCard}>
              <View style={styles.historyTopRow}>
                <Text style={styles.historyDate}>{formatDate(item.finishedAt)}</Text>
                <Text style={styles.scorePill}>Балл: {item.totalScore}/100</Text>
              </View>
              <Text style={styles.wordsPreview}>
                {item.words
                  .slice(0, 4)
                  .map((wordItem) => `${wordItem.word} (${wordItem.score})`)
                  .join(" • ")}
              </Text>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#FDF8ED",
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 10,
    gap: 12,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  greeting: {
    fontSize: 27,
    fontWeight: "800",
    color: "#0F172A",
  },
  subtitle: {
    marginTop: 3,
    color: "#334155",
    fontSize: 15,
    maxWidth: 250,
  },
  logoutButton: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
  },
  logoutText: {
    color: "#0F172A",
    fontWeight: "700",
  },
  statsCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 16,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  statsTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#0F172A",
  },
  statsRow: {
    marginTop: 10,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  statsLabel: {
    color: "#64748B",
    fontWeight: "600",
  },
  statsValue: {
    fontSize: 28,
    color: "#0F766E",
    fontWeight: "800",
  },
  startButton: {
    backgroundColor: "#93C5FD",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  startButtonText: {
    color: "#172554",
    fontSize: 16,
    fontWeight: "800",
  },
  activeCard: {
    borderWidth: 1,
    borderColor: "#67E8F9",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#ECFEFF",
  },
  activeTitle: {
    fontWeight: "700",
    color: "#164E63",
  },
  activeText: {
    marginTop: 2,
    color: "#155E75",
  },
  historyTitle: {
    fontWeight: "800",
    fontSize: 20,
    color: "#0F172A",
    marginTop: 2,
  },
  errorText: {
    color: "#B91C1C",
    fontWeight: "600",
  },
  emptyState: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 16,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#0F172A",
  },
  emptyStateText: {
    marginTop: 5,
    color: "#475569",
    lineHeight: 20,
  },
  historyCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 14,
    shadowColor: "#0F172A",
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 7,
  },
  historyTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  historyDate: {
    color: "#334155",
    fontWeight: "600",
  },
  scorePill: {
    backgroundColor: "#DCFCE7",
    color: "#166534",
    fontWeight: "800",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  wordsPreview: {
    color: "#334155",
    lineHeight: 20,
  },
});
