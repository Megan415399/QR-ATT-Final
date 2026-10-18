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
import {
  getAdminAttendanceRecords,
  updateAdminAttendanceStatus,
  type AdminAttendanceRecord,
} from '@/lib/attendance';

export default function AdminScreen() {
  const { user, loading: authLoading } = useAuth();

  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecords = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setRecords([]);
      setErrorMessage('Please log in to view attendance records.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);
      const result = await getAdminAttendanceRecords();
      setRecords(result);
    } catch (error) {
      console.error('Could not load admin attendance records:', error);
      setRecords([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load attendance records. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadRecords();
  };

  const changeStatus = (item: AdminAttendanceRecord, newStatus: 'present' | 'late') => {
    if (updatingId) return;

    if (item.status.toLowerCase() === newStatus) {
      Alert.alert('No Change Needed', `This record is already ${newStatus}.`);
      return;
    }

    const displayStatus =
      newStatus === 'present' ? 'Present' : 'Late';

    Alert.alert(
      'Confirm Attendance Correction',
      `Change ${item.studentName}'s attendance for "${item.eventTitle}" to ${displayStatus}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            void saveStatus(item, newStatus);
          },
        },
      ]
    );
  };

  const saveStatus = async (
    item: AdminAttendanceRecord,
    newStatus: 'present' | 'late'
  ) => {
    setUpdatingId(item.id);
    setErrorMessage(null);

    try {
      await updateAdminAttendanceStatus(item.id, newStatus);
      await loadRecords();

      Alert.alert(
        'Success',
        `Attendance status updated to ${newStatus.toUpperCase()}.`
      );
    } catch (error) {
      console.error('Could not correct attendance:', error);
      Alert.alert(
        'Update Failed',
        error instanceof Error
          ? error.message
          : 'Could not update attendance. Please try again.'
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const presentCount = records.filter(
    (record) => record.status?.toLowerCase() === 'present'
  ).length;

  const lateCount = records.filter(
    (record) => record.status?.toLowerCase() === 'late'
  ).length;

  const formatDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';
    return date.toLocaleString();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>
      <Text style={styles.subtitle}>
        Monitor and correct attendance records from all events.
      </Text>

      {errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      {loading ? (
        <ActivityIndicator
          size="large"
          color={COLORS.primary}
          style={styles.loader}
        />
      ) : (
        <>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>
              Total Attendance Records
            </Text>
            <Text style={styles.summaryValue}>{records.length}</Text>

            <View style={styles.reportRow}>
              <View style={styles.reportItem}>
                <Text style={styles.reportLabel}>Present</Text>
                <Text style={styles.presentValue}>{presentCount}</Text>
              </View>

              <View style={styles.reportItem}>
                <Text style={styles.reportLabel}>Late</Text>
                <Text style={styles.lateValue}>{lateCount}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Attendance Records</Text>

          <FlatList
            data={records}
            keyExtractor={(item) => item.id}
            contentContainerStyle={
              records.length === 0
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
                No attendance records found.
              </Text>
            }
            renderItem={({ item }) => {
              const currentStatus = item.status?.toLowerCase();
              const isUpdating = updatingId === item.id;

              return (
                <View style={styles.recordCard}>
                  <Text style={styles.eventTitle}>
                    {item.eventTitle || 'Untitled Event'}
                  </Text>

                  <Text style={styles.detail}>
                    Event Code: {item.eventCode || 'N/A'}
                  </Text>
                  <Text style={styles.detail}>
                    Student: {item.studentName}
                  </Text>
                  <Text style={styles.detail}>
                    Student ID: {item.studentId}
                  </Text>
                  <Text style={styles.detail}>
                    Scanned: {formatDate(item.scannedAt)}
                  </Text>

                  <View
                    style={[
                      styles.statusBadge,
                      currentStatus === 'late'
                        ? styles.lateBadge
                        : styles.presentBadge,
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {currentStatus?.toUpperCase() || 'PRESENT'}
                    </Text>
                  </View>

                  <Text style={styles.actionLabel}>
                    Correct attendance status:
                  </Text>

                  <View style={styles.actionRow}>
                    <Pressable
                      disabled={updatingId !== null || currentStatus === 'present'}
                      onPress={() => changeStatus(item, 'present')}
                      style={[
                        styles.actionButton,
                        styles.presentButton,
                        (updatingId !== null || currentStatus === 'present') &&
                          styles.disabledButton,
                      ]}
                    >
                      {isUpdating && currentStatus !== 'present' ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>Set Present</Text>
                      )}
                    </Pressable>

                    <Pressable
                      disabled={updatingId !== null || currentStatus === 'late'}
                      onPress={() => changeStatus(item, 'late')}
                      style={[
                        styles.actionButton,
                        styles.lateButton,
                        (updatingId !== null || currentStatus === 'late') &&
                          styles.disabledButton,
                      ]}
                    >
                      {isUpdating && currentStatus !== 'late' ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.buttonText}>Set Late</Text>
                      )}
                    </Pressable>
                  </View>
                </View>
              );
            }}
          />
        </>
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
    marginBottom: 22,
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
  reportRow: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  reportItem: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
  },
  reportLabel: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  presentValue: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  lateValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#B7791F',
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 12,
  },
  errorText: {
    fontSize: 14,
    color: '#B3261E',
    marginBottom: 10,
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
  recordCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  detail: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 5,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  presentBadge: {
    backgroundColor: '#DDF3E4',
  },
  lateBadge: {
    backgroundColor: '#FFF0D2',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textPrimary,
    marginTop: 14,
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionButton: {
    flex: 1,
    minHeight: 42,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  presentButton: {
    backgroundColor: COLORS.primary,
  },
  lateButton: {
    backgroundColor: '#B7791F',
  },
  disabledButton: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
