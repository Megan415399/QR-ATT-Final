
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRouter } from 'expo-router';

import AppButton from '@/components/AppButton';
import { COLORS } from '@/constants/colors';
import { signOut, useAuth } from '@/lib/auth';
import { getProfile, updateProfile, type Profile } from '@/lib/profiles';

export default function ProfileScreen() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [saving, setSaving] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const loadProfile = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const result = await getProfile(user.id);
      setProfile(result);
      setDraftName(result?.full_name ?? '');
    } catch (error) {
      console.error('Could not load profile:', error);
      Alert.alert(
        'Error',
        'Could not load your profile. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadProfile();
    }, [loadProfile])
  );

  const handleSaveName = async () => {
    if (!user || saving) return;

    const cleanedName = draftName.trim();

    if (!cleanedName) {
      Alert.alert('Name Required', 'Please enter your full name.');
      return;
    }

    if (cleanedName.length > 100) {
      Alert.alert(
        'Name Too Long',
        'Your name must be 100 characters or fewer.'
      );
      return;
    }

    setSaving(true);

    try {
      const { error } = await updateProfile(user.id, {
        full_name: cleanedName,
      });

      if (error) {
        Alert.alert('Error', error);
        return;
      }

      setProfile((previous) =>
        previous
          ? { ...previous, full_name: cleanedName }
          : previous
      );

      setDraftName(cleanedName);
      setEditing(false);

      Alert.alert('Success', 'Your profile name has been updated.');
    } catch (error) {
      console.error('Profile update failed:', error);
      Alert.alert('Error', 'Could not update your name.');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = () => {
    if (signingOut) return;

    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => {
          void confirmSignOut();
        },
      },
    ]);
  };

  const confirmSignOut = async () => {
    if (signingOut) return;

    setSigningOut(true);

    try {
      const { error } = await signOut();

      if (error) {
        Alert.alert('Error', error.message || 'Failed to sign out.');
        return;
      }

      router.replace('/login');
    } catch (error) {
      console.error('Sign out failed:', error);
      Alert.alert('Error', 'Failed to sign out. Please try again.');
    } finally {
      setSigningOut(false);
    }
  };

  if (authLoading || loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading profile...</Text>
      </View>
    );
  }

  if (!user) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="person-circle-outline"
          size={56}
          color={COLORS.primary}
        />
        <Text style={styles.emptyTitle}>Not Logged In</Text>
        <Text style={styles.subtitle}>
          Please log in to view your profile.
        </Text>
      </View>
    );
  }

  if (!profile) {
    return (
      <View style={styles.centerContainer}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={COLORS.textSecondary}
        />
        <Text style={styles.emptyTitle}>Profile Unavailable</Text>
        <Text style={styles.subtitle}>
          Your profile could not be loaded.
        </Text>
        <AppButton
          theme="primary"
          title="Try Again"
          icon="refresh"
          onPress={() => void loadProfile()}
        />
      </View>
    );
  }

  const roleLabel =
    profile.role === 'admin'
      ? 'Admin'
      : profile.role === 'teacher'
        ? 'Teacher'
        : 'Student';

  const displayedEmail =
    user.email?.trim() || profile.email?.trim() || '';

  const profileInitial =
    profile.full_name?.trim().charAt(0).toUpperCase() || '?';

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {/* Profile Header */}
      <View style={styles.headerSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarInitial}>
            {profileInitial}
          </Text>
        </View>

        <Text style={styles.screenTitle}>My Profile</Text>

        <Text style={styles.headerSubtitle}>
          View and manage your account information.
        </Text>

        <View
          style={[
            styles.roleBadge,
            profile.role === 'student' && styles.studentBadge,
            profile.role === 'admin' && styles.adminBadge,
          ]}
        >
          <Text style={styles.roleBadgeText}>{roleLabel}</Text>
        </View>
      </View>

      {/* Account Details */}
      <View style={styles.card}>
        <View style={styles.cardHeading}>
          <Ionicons
            name="person-circle-outline"
            size={21}
            color={COLORS.primary}
          />
          <Text style={styles.cardTitle}>Account Information</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Full Name</Text>

          {editing ? (
            <>
              <TextInput
                style={styles.input}
                value={draftName}
                onChangeText={setDraftName}
                placeholder="Enter full name"
                placeholderTextColor={COLORS.textSecondary}
                autoCapitalize="words"
                autoCorrect={false}
                maxLength={100}
                editable={!saving}
                returnKeyType="done"
                onSubmitEditing={() => void handleSaveName()}
              />

              <View style={styles.actionRow}>
                <Pressable
                  style={[
                    styles.saveButton,
                    saving && styles.disabledButton,
                  ]}
                  onPress={() => void handleSaveName()}
                  disabled={saving}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="checkmark-outline"
                      size={17}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.saveButtonText}>
                    {saving ? 'Saving...' : 'Save'}
                  </Text>
                </Pressable>

                <Pressable
                  style={[
                    styles.cancelButton,
                    saving && styles.disabledButton,
                  ]}
                  onPress={() => {
                    setDraftName(profile.full_name ?? '');
                    setEditing(false);
                  }}
                  disabled={saving}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.nameRow}>
              <Text style={styles.value}>
                {profile.full_name || 'Name not available'}
              </Text>

              <Pressable
                style={styles.editButton}
                onPress={() => {
                  setDraftName(profile.full_name ?? '');
                  setEditing(true);
                }}
                accessibilityRole="button"
                accessibilityLabel="Edit full name"
              >
                <Ionicons
                  name="create-outline"
                  size={16}
                  color={COLORS.primary}
                />
                <Text style={styles.editText}>Edit</Text>
              </Pressable>
            </View>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Email Address</Text>
          <View style={styles.valueRow}>
            <Ionicons
              name="mail-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text style={styles.value} selectable>
              {displayedEmail || 'Email not available'}
            </Text>
          </View>
        </View>

        <View style={styles.divider} />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>User ID</Text>
          <View style={styles.valueRow}>
            <Ionicons
              name="finger-print-outline"
              size={18}
              color={COLORS.textSecondary}
            />
            <Text style={styles.valueSmall} selectable>
              {user.id}
            </Text>
          </View>
        </View>
      </View>

      {/* Sign Out */}
      <View style={styles.signOutSection}>
        <Text style={styles.signOutHint}>
          Sign out when you have finished using the app.
        </Text>

        <Pressable
          style={[
            styles.signOutButton,
            signingOut && styles.disabledButton,
          ]}
          onPress={handleSignOut}
          disabled={signingOut}
          accessibilityRole="button"
          accessibilityLabel="Sign out"
        >
          {signingOut ? (
            <ActivityIndicator size="small" color="#DC2626" />
          ) : (
            <Ionicons
              name="log-out-outline"
              size={20}
              color="#DC2626"
            />
          )}
          <Text style={styles.signOutText}>
            {signingOut ? 'Signing Out...' : 'Sign Out'}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 36,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  headerSection: {
    alignItems: 'center',
    marginBottom: 24,
  },

  avatarCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E4F4EA',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },

  avatarInitial: {
    fontSize: 32,
    fontWeight: '700',
    color: COLORS.primary,
  },

  screenTitle: {
    fontSize: 23,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  headerSubtitle: {
    fontSize: 13,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginTop: 5,
    marginBottom: 12,
  },

  roleBadge: {
    alignSelf: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 20,
  },

  studentBadge: {
    backgroundColor: '#4CAF50',
  },

  adminBadge: {
    backgroundColor: '#6A1B9A',
  },

  roleBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  card: {
    backgroundColor: COLORS.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 18,
    marginBottom: 22,
  },

  cardHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginBottom: 14,
  },

  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  fieldGroup: {
    paddingVertical: 4,
  },

  label: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: 7,
  },

  value: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    color: COLORS.textPrimary,
    lineHeight: 22,
  },

  valueSmall: {
    flex: 1,
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 18,
  },

  valueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },

  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },

  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },

  editText: {
    fontSize: 13,
    color: COLORS.primary,
    fontWeight: '700',
  },

  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: COLORS.textPrimary,
  },

  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },

  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: COLORS.primary,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
  },

  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },

  cancelButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 9,
  },

  cancelButtonText: {
    color: COLORS.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },

  disabledButton: {
    opacity: 0.6,
  },

  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 14,
  },

  signOutSection: {
    gap: 10,
  },

  signOutHint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },

  signOutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 12,
    paddingVertical: 14,
  },

  signOutText: {
    color: '#DC2626',
    fontWeight: '700',
    fontSize: 15,
  },

  loadingText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 10,
  },

  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 12,
    marginBottom: 8,
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
});
