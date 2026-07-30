import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { PlayfulBackground } from "@/components/playful-background";

export const LoadingScreen = ({ message }: { message: string }) => (
  <View style={styles.container}>
    <PlayfulBackground />
    <ActivityIndicator size="large" color="#0F766E" />
    <Text style={styles.text}>{message}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#FDF8ED",
  },
  text: {
    fontSize: 16,
    color: "#134E4A",
    fontWeight: "600",
  },
});
