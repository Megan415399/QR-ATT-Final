
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
  getAdminCorrectionRequests,
  reviewAttendanceCorrectionRequest,
  type AdminAttendanceRecord,
  type AdminCorrectionRequest,
} from '@/lib/attendance';

export default function AdminScreen() {
  const { user, loading: authLoading } = useAuth();

  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [requests, setRequests] = useState<AdminCorrectionRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setRecords([]);
      setRequests([]);
      setErrorMessage('Please log in to view the admin dashboard.');
      setLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setErrorMessage(null);

      const [attendanceData, requestData] = await Promise.all([
        getAdminAttendanceRecords(),
        getAdminCorrectionRequests(),
      ]);

      setRecords(attendanceData);
      setRequests(requestData);
    } catch (error) {
      console.error('Could not load admin data:', error);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load admin data. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
    }, [loadData])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const handleReview = (
    request: AdminCorrectionRequest,
    decision: 'approved' | 'rejected'
  ) => {
    if (processingId) return;

    const action = decision === 'approved' ? 'approve' : 'reject';

    Alert.alert(
      `${decision === 'approved' ? 'Approve' : 'Reject'} Request`,
      [
        `Student: ${request.studentName}`,
        `Event: ${request.eventTitle}`,
        `Current status: ${request.currentStatus.toUpperCase()}`,
        `Requested status: ${request.requestedStatus.toUpperCase()}`,
        '',
        'Have you checked the event start time and scan time?',
        '',
        `Are you sure you want to ${action} this request?`,
      ].join('\n'),
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: decision === 'approved' ? 'Approve' : 'Reject',
          style: decision === 'rejected' ? 'destructive' : 'default',
          onPress: () => {
            void processReview(request, decision);
          },
        },
      ]
    );
  };

  const processReview = async (
    request: AdminCorrectionRequest,
    decision: 'approved' | 'rejected'
  ) => {
    if (processingId) return;

    setProcessingId(request.id);
    setErrorMessage(null);

    try {
      await reviewAttendanceCorrectionRequest(request.id, decision);
      await loadData();

      Alert.alert(
        'Success',
        decision === 'approved'
          ? 'The correction request was approved. The attendance status has been updated.'
          : 'The correction request was rejected. The attendance status was not changed.'
      );
    } catch (error) {
      console.error('Could not review correction request:', error);

      Alert.alert(
        'Review Failed',
        error instanceof Error
          ? error.message
          : 'Could not review the request. Please try again.'
      );
    } finally {
      setProcessingId(null);
    }
  };

  const presentCount = records.filter(
    (record) => record.status?.toLowerCase() === 'present'
  ).length;

  const lateCount = records.filter(
    (record) => record.status?.toLowerCase() === 'late'
  ).length;

  const pendingRequests = requests.filter(
    (request) => request.status === 'pending'
  );

  const formatDate = (value: string | null | undefined) => {
    if (!value) return 'Not available';

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Date unavailable';

    return date.toLocaleString();
  };

  const getMinutesAfterStart = (
    startTime: string | null | undefined,
    scannedAt: string | null | undefined
  ): number | null => {
    if (!startTime || !scannedAt) return null;

    const start = new Date(startTime).getTime();
    const scan = new Date(scannedAt).getTime();

    if (
      Number.isNaN(start) ||
      Number.isNaN(scan) ||
      scan < start
    ) {
      return null;
    }

    return Math.floor((scan - start) / 60000);
  };

  const renderRequest = ({ item }: { item: AdminCorrectionRequest }) => {
    const isProcessing = processingId === item.id;
    const isPending = item.status === 'pending';

    const minutesAfterStart = getMinutesAfterStart(
      item.eventStartTime,
      item.scannedAt
    );

    const mayBeWithinGracePeriod =
      minutesAfterStart !== null &&
      minutesAfterStart <= 15;

    return (
      <View style={styles.requestCard}>
        <Text style={styles.eventTitle}>
          {item.eventTitle || 'Untitled Event'}
        </Text>

        <Text style={styles.detail}>
          Student: {item.studentName || 'Unknown student'}
        </Text>

        <Text style={styles.detail}>
          Student ID: {item.studentId}
        </Text>

        <View style={styles.timeSection}>
          <Text style={styles.timeHeading}>Attendance Time Check</Text>

          <Text style={styles.detail}>
            Event start time: {formatDate(item.eventStartTime)}
          </Text>

          <Text style={styles.detail}>
            Student scan time: {formatDate(item.scannedAt)}
          </Text>

          <Text style={styles.detail}>
            Minutes after event started:{' '}
            {minutesAfterStart === null
              ? 'Cannot calculate'
              : `${minutesAfterStart} minute(s)`}
          </Text>

          {minutesAfterStart !== null && (
            <Text
              style={[
                styles.checkNotice,
                mayBeWithinGracePeriod
                  ? styles.withinGraceText
                  : styles.afterGraceText,
              ]}
            >
              {mayBeWithinGracePeriod
                ? 'Scan time is within the first 15 minutes. Verify the attendance rule before deciding.'
                : 'Scan time is beyond the first 15 minutes, or the attendance rule may differ. Review before deciding.'}
            </Text>
          )}
        </View>

        <Text style={styles.detail}>
          Current status: {item.currentStatus.toUpperCase()}
        </Text>

        <Text style={styles.detail}>
          Requested status: {item.requestedStatus.toUpperCase()}
        </Text>

        <Text style={styles.reasonTitle}>Student's reason</Text>
        <Text style={styles.reasonText}>{item.reason}</Text>

        <Text style={styles.detail}>
          Submitted: {formatDate(item.createdAt)}
        </Text>

        <View
          style={[
            styles.statusBadge,
            item.status === 'approved'
              ? styles.approvedBadge
              : item.status === 'rejected'
                ? styles.rejectedBadge
                : styles.pendingBadge,
          ]}
        >
          <Text style={styles.statusText}>
            {item.status.toUpperCase()}
          </Text>
        </View>

        {item.adminNote ? (
          <Text style={styles.detail}>
            Admin note: {item.adminNote}
          </Text>
        ) : null}

        {item.reviewedAt ? (
          <Text style={styles.detail}>
            Reviewed: {formatDate(item.reviewedAt)}
          </Text>
        ) : null}

        {isPending && (
          <View style={styles.actionRow}>
            <Pressable
              disabled={processingId !== null}
              onPress={() => handleReview(item, 'approved')}
              style={[
                styles.actionButton,
                styles.approveButton,
                processingId !== null && styles.disabledButton,
              ]}
            >
              {isProcessing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.buttonText}>Approve</Text>
              )}
            </Pressable>

            <Pressable
              disabled={processingId !== null}
              onPress={() => handleReview(item, 'rejected')}
              style={[
                styles.actionButton,
                styles.rejectButton,
                processingId !== null && styles.disabledButton,
              ]}
            >
              <Text style={styles.buttonText}>Reject</Text>
            </Pressable>
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Admin Dashboard</Text>

      <Text style={styles.subtitle}>
        Monitor attendance records and review student correction requests.
      </Text>

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
          data={records}
          keyExtractor={(item) => item.id}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[COLORS.primary]}
            />
          }
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={
            <View>
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

              <View style={styles.requestHeader}>
                <Text style={styles.sectionTitle}>
                  Attendance Correction Requests
                </Text>

                <View style={styles.pendingCountBadge}>
                  <Text style={styles.pendingCountText}>
                    {pendingRequests.length} Pending
                  </Text>
                </View>
              </View>

              {requests.length === 0 ? (
                <Text style={styles.emptyText}>
                  No correction requests have been submitted yet.
                </Text>
              ) : (
                requests.map((request) => (
                  <View key={request.id}>
                    {renderRequest({ item: request })}
                  </View>
                ))
              )}

              <Text style={styles.sectionTitle}>Attendance Records</Text>
            </View>
          }
          ListEmptyComponent={
            <Text style={styles.emptyText}>
              No attendance records found.
            </Text>
          }
          renderItem={({ item }) => {
            const currentStatus = item.status?.toLowerCase();

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
              </View>
            );
          }}
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
  requestHeader: {
    marginBottom: 12,
  },
  pendingCountBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFF0D2',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 12,
  },
  pendingCountText: {
    color: '#805500',
    fontSize: 12,
    fontWeight: '700',
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
    paddingBottom: 30,
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
  requestCard: {
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
  timeSection: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
    marginBottom: 12,
  },
  timeHeading: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 8,
  },
  checkNotice: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 6,
  },
  withinGraceText: {
    color: COLORS.primary,
  },
  afterGraceText: {
    color: '#805500',
  },
  reasonTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 8,
    marginBottom: 5,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
    color: COLORS.textPrimary,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 10,
  },
  statusBadge: {
    alignSelf: 'flex-start',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
    marginBottom: 10,
  },
  presentBadge: {
    backgroundColor: '#DDF3E4',
  },
  lateBadge: {
    backgroundColor: '#FFF0D2',
  },
  pendingBadge: {
    backgroundColor: '#FFF0D2',
  },
  approvedBadge: {
    backgroundColor: '#DDF3E4',
  },
  rejectedBadge: {
    backgroundColor: '#FCE4E4',
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
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
  approveButton: {
    backgroundColor: COLORS.primary,
  },
  rejectButton: {
    backgroundColor: '#B3261E',
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
