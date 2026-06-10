/** Shared mobile UI primitives — the clay card, pills, fields, buttons, text. */
import React from "react";
import {
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { C, FONT, R, clay, claySm } from "../theme";
import { Squish } from "./anim";

export function Txt({
  children,
  style,
  weight = "medium",
  size = 14,
  color = C.ink,
  numberOfLines,
}: {
  children: React.ReactNode;
  style?: StyleProp<TextStyle>;
  weight?: keyof typeof FONT;
  size?: number;
  color?: string;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: FONT[weight], fontSize: size, color }, style]}
    >
      {children}
    </Text>
  );
}

export function Card({
  children,
  style,
  background = C.surface,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  background?: string;
}) {
  return (
    <View
      style={[
        { backgroundColor: background, borderRadius: R.md, padding: 16 },
        clay(),
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Pill({
  text,
  color = C.primary,
  bg = C.surface,
}: {
  text: string;
  color?: string;
  bg?: string;
}) {
  return (
    <View
      style={{
        backgroundColor: bg,
        borderRadius: R.pill,
        paddingHorizontal: 10,
        paddingVertical: 3,
      }}
    >
      <Txt size={12} weight="extrabold" color={color}>
        {text}
      </Txt>
    </View>
  );
}

export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <Txt
      size={12}
      weight="bold"
      color={C.inkFaint}
      style={{ textTransform: "uppercase", letterSpacing: 1 }}
    >
      {children}
    </Txt>
  );
}

export function PrimaryButton({
  label,
  onPress,
  disabled,
  background = C.primary,
  color = "#fff",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  background?: string;
  color?: string;
}) {
  return (
    <Squish
      onPress={onPress}
      disabled={disabled}
      style={[
        {
          backgroundColor: background,
          borderRadius: R.sm,
          paddingHorizontal: 20,
          paddingVertical: 11,
          opacity: disabled ? 0.4 : 1,
          alignItems: "center",
        },
        claySm(),
      ]}
    >
      <Txt weight="bold" color={color}>
        {label}
      </Txt>
    </Squish>
  );
}

export function NumberField({
  label,
  value,
  onChange,
  suffix,
  width,
  placeholder = "0",
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
  width?: number;
  placeholder?: string;
}) {
  return (
    <View style={{ gap: 4, width }}>
      {label ? (
        <Txt size={12} weight="bold" color={C.inkSoft}>
          {label}
        </Txt>
      ) : null}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          backgroundColor: C.page2,
          borderRadius: R.sm,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <TextInput
          value={value}
          onChangeText={onChange}
          keyboardType="numeric"
          placeholder={placeholder}
          placeholderTextColor={C.inkFaint}
          style={{ flex: 1, fontFamily: FONT.semibold, fontSize: 14, color: C.ink, padding: 0 }}
        />
        {suffix ? (
          <Txt size={12} weight="medium" color={C.inkFaint}>
            {suffix}
          </Txt>
        ) : null}
      </View>
    </View>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  onSubmit,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  onSubmit?: () => void;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.inkFaint}
      onSubmitEditing={onSubmit}
      returnKeyType="done"
      style={{
        backgroundColor: C.page2,
        borderRadius: R.sm,
        paddingHorizontal: 12,
        paddingVertical: 11,
        fontFamily: FONT.semibold,
        fontSize: 14,
        color: C.ink,
      }}
    />
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: "rgba(20,26,24,0.08)" }} />;
}
