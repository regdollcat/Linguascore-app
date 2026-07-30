import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";

export const PlayfulBackground = () => {
  const driftA = useRef(new Animated.Value(0)).current;
  const driftB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animationA = Animated.loop(
      Animated.sequence([
        Animated.timing(driftA, {
          toValue: 1,
          duration: 5000,
          useNativeDriver: true,
        }),
        Animated.timing(driftA, {
          toValue: 0,
          duration: 5000,
          useNativeDriver: true,
        }),
      ])
    );

    const animationB = Animated.loop(
      Animated.sequence([
        Animated.timing(driftB, {
          toValue: 1,
          duration: 7000,
          useNativeDriver: true,
        }),
        Animated.timing(driftB, {
          toValue: 0,
          duration: 7000,
          useNativeDriver: true,
        }),
      ])
    );

    animationA.start();
    animationB.start();

    return () => {
      animationA.stop();
      animationB.stop();
    };
  }, [driftA, driftB]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <Animated.View
        style={[
          styles.blobLarge,
          {
            transform: [
              {
                translateX: driftA.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-8, 12],
                }),
              },
              {
                translateY: driftA.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-6, 10],
                }),
              },
            ],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.blobMedium,
          {
            transform: [
              {
                translateX: driftB.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, -14],
                }),
              },
              {
                translateY: driftB.interpolate({
                  inputRange: [0, 1],
                  outputRange: [10, -10],
                }),
              },
            ],
          },
        ]}
      />

      <View style={styles.dot} />
    </View>
  );
};

const styles = StyleSheet.create({
  blobLarge: {
    position: "absolute",
    width: 230,
    height: 230,
    borderRadius: 230,
    backgroundColor: "#FFE08A",
    top: -40,
    left: -60,
    opacity: 0.65,
  },
  blobMedium: {
    position: "absolute",
    width: 170,
    height: 170,
    borderRadius: 170,
    backgroundColor: "#A7F3D0",
    right: -40,
    top: 160,
    opacity: 0.55,
  },
  dot: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 120,
    backgroundColor: "#93C5FD",
    bottom: -30,
    right: 40,
    opacity: 0.45,
  },
});
