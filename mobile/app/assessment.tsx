import { Audio } from "expo-av";
import * as Haptics from "expo-haptics";
import { Redirect, router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { LoadingScreen } from "@/components/loading-screen";
import { PlayfulBackground } from "@/components/playful-background";
import { ApiError, api } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import type { Assessment, GradeWordResponse } from "@/lib/types";

type LastPronunciationFeedback = {
  word: string;
  recognizedText: string;
  pronunciationScore100: number | null;
  accuracyScore: number | null;
  fluencyScore: number | null;
  completenessScore: number | null;
  prosodyScore: number | null;
  score100: number;
};

const formatDuration = (milliseconds: number): string => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

export default function AssessmentScreen() {
  const { session } = useAuth();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isGrading, setIsGrading] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [recording, setRecording] = useState<Audio.Recording | null>(null);
  const [recordingStartedAt, setRecordingStartedAt] = useState<number | null>(null);
  const [recordingDurationMs, setRecordingDurationMs] = useState(0);
  const [error, setError] = useState("");
  const [lastFeedback, setLastFeedback] = useState<LastPronunciationFeedback | null>(null);

  const wordScale = useRef(new Animated.Value(1)).current;
  const scorePulse = useRef(new Animated.Value(0)).current;
  const resultScale = useRef(new Animated.Value(1)).current;
  const recordPulse = useRef(new Animated.Value(0)).current;

  const currentPosition = assessment?.nextPosition ?? null;
  const currentWord = currentPosition !== null ? assessment?.words[currentPosition] ?? null : null;
  const isRecording = recording !== null;

  const loadActiveAssessment = useCallback(async () => {
    if (!session?.token) {
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const response = await api.activeAssessment(session.token);
      setAssessment(response.assessment);
    } catch {
      setError("Не удалось загрузить активную оценку");
    } finally {
      setIsLoading(false);
    }
  }, [session?.token]);

  useFocusEffect(
    useCallback(() => {
      void loadActiveAssessment();
    }, [loadActiveAssessment])
  );

  useEffect(() => {
    if (currentPosition === null) {
      return;
    }

    wordScale.setValue(0.92);
    Animated.spring(wordScale, {
      toValue: 1,
      speed: 14,
      bounciness: 11,
      useNativeDriver: true,
    }).start();
  }, [currentPosition, wordScale]);

  useEffect(() => {
    if (!assessment?.finishedAt) {
      return;
    }

    resultScale.setValue(0.96);
    Animated.spring(resultScale, {
      toValue: 1,
      speed: 12,
      bounciness: 10,
      useNativeDriver: true,
    }).start();
  }, [assessment?.finishedAt, resultScale]);

  useEffect(() => {
    if (!isRecording) {
      recordPulse.stopAnimation();
      recordPulse.setValue(0);
      return;
    }

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(recordPulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(recordPulse, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
      ])
    );

    pulseLoop.start();
    return () => pulseLoop.stop();
  }, [isRecording, recordPulse]);

  useEffect(() => {
    if (!isRecording || recordingStartedAt === null) {
      return;
    }

    const timer = setInterval(() => {
      setRecordingDurationMs(Date.now() - recordingStartedAt);
    }, 250);

    return () => clearInterval(timer);
  }, [isRecording, recordingStartedAt]);

  useEffect(() => {
    return () => {
      if (recording) {
        void recording.stopAndUnloadAsync().catch(() => undefined);
      }
    };
  }, [recording]);

  const scoredWordsCount = useMemo(
    () => assessment?.words.filter((wordItem) => wordItem.score !== null).length ?? 0,
    [assessment]
  );

  const progress = useMemo(() => {
    if (!assessment) {
      return 0;
    }

    return Math.round((scoredWordsCount / assessment.words.length) * 100);
  }, [assessment, scoredWordsCount]);

  if (!session) {
    return <Redirect href="/login" />;
  }

  const startNewAttempt = async () => {
    setIsStarting(true);
    setError("");
    setLastFeedback(null);

    try {
      await api.startAssessment(session.token);
      await loadActiveAssessment();
    } catch {
      setError("Не удалось создать новую попытку");
    } finally {
      setIsStarting(false);
    }
  };

  const startRecording = async () => {
    if (!currentWord) {
      return;
    }

    setError("");

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      setError("Нужен доступ к микрофону для оценки произношения");
      return;
    }

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const nextRecording = new Audio.Recording();
      await nextRecording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await nextRecording.startAsync();

      setRecording(nextRecording);
      setRecordingStartedAt(Date.now());
      setRecordingDurationMs(0);
      setLastFeedback(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    } catch {
      setError("Не удалось начать запись");
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);
    }
  };

  const applyGradeResponse = (response: GradeWordResponse) => {
    setAssessment((previous) => {
      if (!previous) {
        return previous;
      }

      const updatedWords = previous.words.map((wordItem) =>
        wordItem.position === response.position ? { ...wordItem, score: response.score } : wordItem
      );

      return {
        ...previous,
        words: updatedWords,
        nextPosition: response.nextPosition,
      };
    });

    setLastFeedback({
      word: response.word,
      recognizedText: response.pronunciation?.recognizedText ?? "",
      pronunciationScore100: response.pronunciation?.pronunciationScore100 ?? null,
      accuracyScore: response.pronunciation?.accuracyScore ?? null,
      fluencyScore: response.pronunciation?.fluencyScore ?? null,
      completenessScore: response.pronunciation?.completenessScore ?? null,
      prosodyScore: response.pronunciation?.prosodyScore ?? null,
      score100: response.score,
    });

    scorePulse.setValue(0);
    Animated.sequence([
      Animated.timing(scorePulse, {
        toValue: 1,
        duration: 220,
        useNativeDriver: true,
      }),
      Animated.timing(scorePulse, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const stopRecordingAndGrade = async () => {
    if (!assessment || currentPosition === null || !recording || !currentWord) {
      return;
    }

    setIsGrading(true);
    setError("");

    const activeRecording = recording;
    setRecording(null);
    setRecordingStartedAt(null);
    setRecordingDurationMs(0);

    try {
      await activeRecording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(() => undefined);

      const audioUri = activeRecording.getURI();
      if (!audioUri) {
        throw new Error("Не удалось получить URI записи");
      }

      const filename = audioUri.split("/").pop() || `word-${currentPosition + 1}.m4a`;
      const response = await api.gradeWordWithAudio(
        session.token,
        assessment.id,
        currentPosition,
        audioUri,
        filename
      );

      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
      applyGradeResponse(response);
    } catch (unknownError) {
      if (unknownError instanceof ApiError) {
        setError(unknownError.message);
      } else {
        setError("Не удалось отправить запись и получить оценку");
      }
    } finally {
      setIsGrading(false);
    }
  };

  const handleRecordButtonPress = async () => {
    if (isGrading || isFinishing) {
      return;
    }

    if (isRecording) {
      await stopRecordingAndGrade();
      return;
    }

    await startRecording();
  };

  const finishAttempt = async () => {
    if (!assessment) {
      return;
    }

    setIsFinishing(true);
    setError("");

    try {
      const response = await api.finishAssessment(session.token, assessment.id);
      setAssessment(response.assessment);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch (unknownError) {
      if (unknownError instanceof ApiError) {
        setError(unknownError.message);
      } else {
        setError("Не удалось завершить попытку");
      }
    } finally {
      setIsFinishing(false);
    }
  };

  if (isLoading) {
    return <LoadingScreen message="Загружаем текущую оценку..." />;
  }

  if (!assessment) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <PlayfulBackground />
        <View style={styles.centeredContainer}>
          <Text style={styles.emptyTitle}>Активной попытки нет</Text>
          <Text style={styles.emptyText}>Создайте новую попытку и получите оценку произношения для 10 слов</Text>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <Pressable style={styles.primaryButton} onPress={startNewAttempt} disabled={isStarting}>
            {isStarting ? <ActivityIndicator color="#172554" /> : <Text style={styles.primaryButtonText}>Начать новую оценку</Text>}
          </Pressable>

          <Pressable style={styles.secondaryButton} onPress={() => router.replace("/home")}>
            <Text style={styles.secondaryButtonText}>К истории</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  const isCompletedButNotFinished = currentPosition === null && !assessment.finishedAt;

  return (
    <SafeAreaView style={styles.safeArea}>
      <PlayfulBackground />
      <ScrollView contentContainerStyle={styles.contentContainer}>
        <View style={styles.headerRow}>
          <Pressable
            style={styles.backButton}
            onPress={() => {
              if (!isRecording) {
                router.replace("/home");
              }
            }}
            disabled={isRecording}
          >
            <Text style={styles.backButtonText}>{isRecording ? "Идёт запись..." : "← История"}</Text>
          </Pressable>
          <Text style={styles.headerTitle}>Оценка произношения</Text>
        </View>

        <View style={styles.progressContainer}>
          <View style={styles.progressMetaRow}>
            <Text style={styles.progressText}>Прогресс: {scoredWordsCount}/10 слов</Text>
            <Animated.Text
              style={[
                styles.progressText,
                {
                  transform: [
                    {
                      scale: scorePulse.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 1.1],
                      }),
                    },
                  ],
                },
              ]}
            >
              {progress}%
            </Animated.Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress}%` }]} />
          </View>
        </View>

        {assessment.finishedAt ? (
          <Animated.View style={[styles.resultCard, { transform: [{ scale: resultScale }] }]}>
            <Text style={styles.resultEmoji}>🎉</Text>
            <Text style={styles.resultTitle}>Попытка завершена</Text>
            <Text style={styles.resultScore}>Итоговый балл: {assessment.totalScore}/100</Text>

            <Text style={styles.resultSubtitle}>По словам:</Text>
            {assessment.words.map((wordItem) => (
              <View style={styles.resultRow} key={wordItem.position}>
                <Text style={styles.resultWord}>{wordItem.word}</Text>
                <Text style={styles.resultWordScore}>{wordItem.score}/100</Text>
              </View>
            ))}

            <Pressable style={styles.primaryButton} onPress={() => router.replace("/home")}>
              <Text style={styles.primaryButtonText}>Вернуться к истории</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <>
            <Text style={styles.instruction}>Произнеси слово вслух, затем останови запись и дождись оценки Azure</Text>

            <Animated.View style={[styles.wordCard, { transform: [{ scale: wordScale }] }]}>
              <Text style={styles.wordText}>{currentWord?.word ?? "Готово"}</Text>
              {isRecording ? (
                <Animated.View
                  style={[
                    styles.recordingBadge,
                    {
                      transform: [
                        {
                          scale: recordPulse.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 1.08],
                          }),
                        },
                      ],
                    },
                  ]}
                >
                  <Text style={styles.recordingBadgeText}>● Запись {formatDuration(recordingDurationMs)}</Text>
                </Animated.View>
              ) : null}
            </Animated.View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {isCompletedButNotFinished ? (
              <Pressable style={styles.primaryButton} onPress={finishAttempt} disabled={isFinishing}>
                {isFinishing ? (
                  <ActivityIndicator color="#172554" />
                ) : (
                  <Text style={styles.primaryButtonText}>Завершить и получить итог</Text>
                )}
              </Pressable>
            ) : (
              <Pressable
                style={[
                  styles.primaryButton,
                  isRecording ? styles.primaryButtonRecording : null,
                  isGrading ? styles.primaryButtonDisabled : null,
                ]}
                onPress={() => void handleRecordButtonPress()}
                disabled={isGrading}
              >
                {isGrading ? (
                  <ActivityIndicator color="#172554" />
                ) : (
                  <Text style={styles.primaryButtonText}>
                    {isRecording ? "Остановить и оценить" : "Начать запись"}
                  </Text>
                )}
              </Pressable>
            )}

            {lastFeedback ? (
              <View style={styles.feedbackCard}>
                <View style={styles.feedbackHeaderRow}>
                  <Text style={styles.feedbackTitle}>Последний результат</Text>
                  <Text style={styles.feedbackScore}>{lastFeedback.score100}/100</Text>
                </View>
                <Text style={styles.feedbackLine}>Слово: {lastFeedback.word}</Text>
                <Text style={styles.feedbackLine}>
                  Распознано: {lastFeedback.recognizedText || "(Azure не вернул текст)"}
                </Text>
                <View style={styles.metricsRow}>
                  <Text style={styles.metricChip}>
                    Оценка произношения: {lastFeedback.pronunciationScore100 ?? "-"} / 100
                  </Text>
                  <Text style={styles.metricChip}>Точность: {lastFeedback.accuracyScore ?? "-"} / 100</Text>
                  <Text style={styles.metricChip}>Беглость: {lastFeedback.fluencyScore ?? "-"} / 100</Text>
                  <Text style={styles.metricChip}>
                    Полнота: {lastFeedback.completenessScore ?? "-"} / 100
                  </Text>
                  <Text style={styles.metricChip}>Просодия: {lastFeedback.prosodyScore ?? "-"} / 100</Text>
                </View>
              </View>
            ) : null}

            <View style={styles.scoresCard}>
              <Text style={styles.scoresTitle}>Текущие баллы</Text>
              <View style={styles.scoresGrid}>
                {assessment.words.map((wordItem) => (
                  <View key={wordItem.position} style={styles.scoreChip}>
                    <Text style={styles.scoreChipLabel}>{wordItem.position + 1}</Text>
                    <Text style={styles.scoreChipValue}>{wordItem.score !== null ? wordItem.score : "-"}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
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
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 10,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  emptyText: {
    textAlign: "center",
    color: "#475569",
    lineHeight: 22,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 24,
    gap: 14,
  },
  headerRow: {
    gap: 8,
  },
  backButton: {
    alignSelf: "flex-start",
    backgroundColor: "#E2E8F0",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
  },
  backButtonText: {
    color: "#1E293B",
    fontWeight: "700",
  },
  headerTitle: {
    fontSize: 25,
    fontWeight: "800",
    color: "#0F172A",
  },
  progressContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 12,
    gap: 8,
  },
  progressMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  progressText: {
    color: "#1E293B",
    fontWeight: "700",
  },
  progressTrack: {
    height: 10,
    backgroundColor: "#E2E8F0",
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#34D399",
  },
  instruction: {
    color: "#334155",
    fontSize: 16,
    fontWeight: "600",
  },
  wordCard: {
    borderRadius: 20,
    backgroundColor: "#DBEAFE",
    paddingVertical: 32,
    paddingHorizontal: 14,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#93C5FD",
    gap: 12,
  },
  wordText: {
    fontSize: 38,
    fontWeight: "800",
    color: "#172554",
    textAlign: "center",
  },
  recordingBadge: {
    backgroundColor: "#FEE2E2",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  recordingBadgeText: {
    color: "#991B1B",
    fontWeight: "800",
  },
  errorText: {
    color: "#B91C1C",
    fontWeight: "600",
  },
  primaryButton: {
    borderRadius: 14,
    backgroundColor: "#93C5FD",
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryButtonRecording: {
    backgroundColor: "#FCA5A5",
  },
  primaryButtonDisabled: {
    opacity: 0.8,
  },
  primaryButtonText: {
    color: "#172554",
    fontWeight: "800",
    fontSize: 16,
  },
  secondaryButton: {
    borderRadius: 14,
    backgroundColor: "#E2E8F0",
    paddingVertical: 12,
    alignItems: "center",
    width: "100%",
  },
  secondaryButtonText: {
    color: "#1E293B",
    fontWeight: "700",
    fontSize: 15,
  },
  feedbackCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 6,
  },
  feedbackHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  feedbackTitle: {
    fontWeight: "800",
    color: "#0F172A",
  },
  feedbackScore: {
    color: "#166534",
    fontWeight: "800",
    backgroundColor: "#DCFCE7",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  feedbackLine: {
    color: "#334155",
    lineHeight: 20,
  },
  metricsRow: {
    flexDirection: "column",
    gap: 6,
    marginTop: 2,
  },
  metricChip: {
    backgroundColor: "#EEF2FF",
    color: "#3730A3",
    fontWeight: "700",
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  scoresCard: {
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    padding: 12,
    gap: 10,
  },
  scoresTitle: {
    fontWeight: "700",
    color: "#0F172A",
    fontSize: 16,
  },
  scoresGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  scoreChip: {
    width: "18%",
    minWidth: 52,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    paddingVertical: 8,
    alignItems: "center",
    gap: 2,
  },
  scoreChipLabel: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 12,
  },
  scoreChipValue: {
    color: "#0F172A",
    fontWeight: "800",
    fontSize: 16,
  },
  resultCard: {
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    padding: 16,
    gap: 10,
  },
  resultEmoji: {
    fontSize: 40,
    textAlign: "center",
  },
  resultTitle: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0F172A",
    textAlign: "center",
  },
  resultScore: {
    textAlign: "center",
    fontSize: 22,
    color: "#166534",
    fontWeight: "800",
  },
  resultSubtitle: {
    marginTop: 4,
    color: "#475569",
    fontWeight: "700",
  },
  resultRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    backgroundColor: "#F8FAFC",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  resultWord: {
    color: "#0F172A",
    fontWeight: "600",
  },
  resultWordScore: {
    color: "#0F766E",
    fontWeight: "800",
  },
});
