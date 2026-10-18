
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

type UserRole = 'student' | 'teacher' | 'admin';
type RoleFilter = 'all' | UserRole;

type UserProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: UserRole;
};

export default function AdminUsersScreen() {
  const { user, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filter, setFilter] = useState<RoleFilter>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingAction, setUpdatingAction] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  const loadUsers = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setUsers([]);
      setErrorMessage('Please log in to view users.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage('');

      const { data: currentProfile, error: profileError } =
        await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .maybeSingle();

      if (profileError) throw profileError;

      if (currentProfile?.role !== 'admin') {
        setUsers([]);
        setErrorMessage('Only administrators can view all users.');
        return;
      }

      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .order('full_name', { ascending: true });

      if (error) throw error;

      const validUsers: UserProfile[] = (data ?? []).filter(
        (profile): profile is UserProfile =>
          typeof profile.id === 'string' &&
          (profile.role === 'student' ||
            profile.role === 'teacher' ||
            profile.role === 'admin')
      );

      setUsers(validUsers);
    } catch (error) {
      console.error('Could not load users:', error);
      setUsers([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load users. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadUsers();
    }, [loadUsers])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadUsers();
  };

  const updateUserRole = async (
    targetUser: UserProfile,
    newRole: UserRole
  ) => {
    if (!user || targetUser.id === user.id) {
      setErrorMessage('You cannot change your own role.');
      return;
    }

    const actionKey = `${targetUser.id}-${newRole}`;

    if (updatingAction !== null) return;

    setUpdatingAction(actionKey);
    setErrorMessage('');

    try {
      const { error } = await supabase.rpc('admin_update_user_role', {
        target_user_id: targetUser.id,
        new_role: newRole,
      });

      if (error) throw error;

      await loadUsers();

      Alert.alert('Success', `User role changed to ${newRole}.`);
    } catch (error) {
      console.error('Could not update user role:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not update user role. Please try again.'
      );
    } finally {
      setUpdatingAction(null);
    }
  };

  const handleRoleChange = (
    targetUser: UserProfile,
    newRole: UserRole
  ) => {
    Alert.alert(
      'Change User Role',
      `Change ${targetUser.full_name || targetUser.email || 'this user'} from ${targetUser.role} to ${newRole}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            void updateUserRole(targetUser, newRole);
          },
        },
      ]
    );
  };

  const filteredUsers =
    filter === 'all'
      ? users
      : users.filter((profile) => profile.role === filter);

  const countForRole = (role: RoleFilter) =>
    role === 'all'
      ? users.length
      : users.filter((profile) => profile.role === role).length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Manage Users</Text>
      <Text style={styles.subtitle}>
        View registered users and manage their roles.
      </Text>

      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Registered Users</Text>
        <Text style={styles.summaryValue}>{users.length}</Text>
      </View>

      <View style={styles.filters}>
        {(['all', 'student', 'teacher', 'admin'] as RoleFilter[]).map(
          (role) => (
            <Pressable
              key={role}
              onPress={() => setFilter(role)}
              style={[
                styles.filterButton,
                filter === role && styles.activeFilter,
              ]}
            >
              <Text
                style={[
                  styles.filterText,
                  filter === role && styles.activeFilterText,
                ]}
              >
                {role === 'all'
                  ? `All (${countForRole(role)})`
                  : `${role.charAt(0).toUpperCase()}${role.slice(1)} (${countForRole(role)})`}
              </Text>
            </Pressable>
          )
        )}
      </View>

      {errorMessage ? (
        <Text style={styles.errorText}>{errorMessage}</Text>
      ) : null}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.loader}
        />
      ) : (
        <FlatList
          data={filteredUsers}
          keyExtractor={(item) => item.id}
          contentContainerStyle={
            filteredUsers.length === 0
              ? styles.emptyContainer
              : styles.listContent
          }
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              {errorMessage ? '' : 'No users found for this filter.'}
            </Text>
          }
          renderItem={({ item }) => (
            <View style={styles.userCard}>
              <Text style={styles.userName}>
                {item.full_name?.trim() || 'Unnamed User'}
              </Text>

              <Text style={styles.userEmail}>
                {item.email || 'Email unavailable'}
              </Text>

              <Text style={styles.userId}>User ID: {item.id}</Text>

              <View style={styles.roleBadge}>
                <Text style={styles.roleText}>
                  CURRENT ROLE: {item.role.toUpperCase()}
                </Text>
              </View>

              {item.id !== user?.id && (
                <View style={styles.roleActions}>
                  {(['student', 'teacher', 'admin'] as UserRole[])
                    .filter((role) => role !== item.role)
                    .map((role) => {
                      const actionKey = `${item.id}-${role}`;
                      const isThisButtonLoading =
                        updatingAction === actionKey;

                      return (
                        <Pressable
                          key={role}
                          disabled={updatingAction !== null}
                          onPress={() => handleRoleChange(item, role)}
                          style={[
                            styles.roleAction,
                            updatingAction !== null &&
                              styles.disabledAction,
                          ]}
                        >
                          {isThisButtonLoading ? (
                            <ActivityIndicator
                              size="small"
                              color={COLORS.primary}
                            />
                          ) : (
                            <Text style={styles.roleActionText}>
                              Set{' '}
                              {role.charAt(0).toUpperCase() + role.slice(1)}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}
                </View>
              )}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 18,
  },
  summaryCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  summaryLabel: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  summaryValue: {
    fontSize: 30,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 6,
  },
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  filterButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  activeFilter: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterText: {
    color: COLORS.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  activeFilterText: {
    color: '#FFFFFF',
  },
  errorText: {
    color: '#B3261E',
    fontSize: 14,
    marginBottom: 12,
  },
  loader: {
    marginTop: 24,
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
  userCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  userName: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 5,
  },
  userEmail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 6,
  },
  userId: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: 10,
  },
  roleBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#DDF3E4',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  roleText: {
    fontSize: 11,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  roleActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  roleAction: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  roleActionText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  disabledAction: {
    opacity: 0.5,
  },
});
