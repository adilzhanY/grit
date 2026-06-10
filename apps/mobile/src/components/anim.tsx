/**
 * Animation primitives ported from the web's CSS keyframes:
 *  - PopIn      → @keyframes pop-in (modals)
 *  - FloatUp    → @keyframes float-up (XP +N on completion)
 *  - Squish     → .clay-press active scale (pressable squish)
 *  - Celebrate  → @keyframes celebrate (level-up overlay)
 */
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, View, type ViewStyle } from "react-native";

/** Smooth expand/collapse by animating height (like the web grid-rows trick). */
export function Collapsible({ open, children }: { open: boolean; children: React.ReactNode }) {
  const [measured, setMeasured] = useState(0);
  const h = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(h, {
      toValue: open ? measured : 0,
      duration: 260,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [open, measured, h]);
  return (
    <Animated.View style={{ height: measured ? h : undefined, overflow: "hidden" }}>
      <View
        style={{ position: "absolute", left: 0, right: 0 }}
        onLayout={(e) => setMeasured(e.nativeEvent.layout.height)}
      >
        {children}
      </View>
    </Animated.View>
  );
}

/** Spring scale+fade in — the modal/pill entrance. */
export function PopIn({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 6, tension: 140 }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        { opacity: v, transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Celebrate entrance — scale + slight rotate settle. */
export function Celebrate({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(v, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [v]);
  return (
    <Animated.View
      style={[
        style,
        {
          opacity: v,
          transform: [
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
            { rotate: v.interpolate({ inputRange: [0, 1], outputRange: ["-8deg", "0deg"] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** A one-shot "+N" that floats up and fades (keyed remount restarts it). */
export function FloatUp({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration: 1000, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  }, [v]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        style,
        {
          opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
          transform: [
            { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) },
            { scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.15] }) },
          ],
        },
      ]}
    >
      {children}
    </Animated.View>
  );
}

/** Pressable that squishes on press (the web .clay-press feel). */
export function Squish({
  children,
  onPress,
  disabled,
  style,
  hitSlop,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  disabled?: boolean;
  style?: ViewStyle | ViewStyle[];
  hitSlop?: number;
}) {
  const v = useRef(new Animated.Value(1)).current;
  const to = (val: number) =>
    Animated.spring(v, { toValue: val, useNativeDriver: true, friction: 7, tension: 220 }).start();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={hitSlop}
      onPressIn={() => to(0.94)}
      onPressOut={() => to(1)}
    >
      <Animated.View style={[style as ViewStyle, { transform: [{ scale: v }] }]}>{children}</Animated.View>
    </Pressable>
  );
}
