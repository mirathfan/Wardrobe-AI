import React, { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";

import { useAppTheme } from "@/src/hooks/useAppTheme";

export const MemoTextInputField = React.memo(function MemoTextInputField({
  value,
  onCommit,
  placeholder,
  multiline,
  keyboardType,
  containerStyle,
  inputStyle,
}: {
  value: string;
  onCommit: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: "default" | "numeric";
  containerStyle?: any;
  inputStyle?: any;
}) {
  const { colors } = useAppTheme();
  const [localValue, setLocalValue] = useState(value);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const commitNow = useCallback(
    (nextValue: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      onCommit(nextValue);
    },
    [onCommit]
  );

  return (
    <View style={containerStyle}>
      <TextInput
        value={localValue}
        onChangeText={(nextValue) => {
          setLocalValue(nextValue);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null;
            onCommit(nextValue);
          }, 180);
        }}
        onBlur={() => commitNow(localValue)}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        keyboardType={keyboardType}
        cursorColor={colors.lightPurple}
        selectionColor={colors.lightPurple}
        style={[
          {
            minHeight: 46,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 14,
            paddingHorizontal: 13,
            paddingVertical: 11,
            color: colors.text,
            backgroundColor: colors.inputBackground,
            fontSize: 15,
            lineHeight: 20,
            fontWeight: "600",
          },
          inputStyle,
        ]}
      />
    </View>
  );
});
