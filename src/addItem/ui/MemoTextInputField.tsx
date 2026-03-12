import React, { useCallback, useEffect, useRef, useState } from "react";
import { TextInput, View } from "react-native";

const input = {
  borderWidth: 1,
  borderColor: "#ddd",
  borderRadius: 12,
  paddingHorizontal: 12,
  paddingVertical: 10,
  fontSize: 16,
} as const;

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
        multiline={multiline}
        keyboardType={keyboardType}
        style={[input, inputStyle]}
      />
    </View>
  );
});
