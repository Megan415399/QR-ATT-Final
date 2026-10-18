import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text } from 'react-native';

import { COLORS } from '@/constants/colors';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  disabled?: boolean;
  onPress: () => void;
};

export default function AppButton({
  title,
  icon,
  theme,
  disabled = false,
  onPress,
}: Props) {
  const isPrimary = theme === 'primary';

  return (
    <Pressable
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.primaryFill : styles.secondaryFill,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
    >
      <Ionicons
        name={icon}
        size={22}
        color={
          isPrimary ? COLORS.textOnPrimary : COLORS.textSecondary
        }
        style={styles.icon}
      />

      <Text style={[styles.label, isPrimary && styles.primaryLabel]}>
        {title}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: '100%',
    marginBottom: 14,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },

  primaryFill: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },

  secondaryFill: {
    backgroundColor: COLORS.card,
    borderColor: COLORS.border,
  },

  icon: {
    marginRight: 10,
  },

  label: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.textPrimary,
  },

  primaryLabel: {
    color: COLORS.textOnPrimary,
    fontWeight: '700',
  },

  pressed: {
    opacity: 0.75,
  },

  disabled: {
    opacity: 0.55,
  },
});