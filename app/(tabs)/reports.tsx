import { useCallback, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { COLORS } from '@/constants/colors';
import { useAuth } from '@/lib/auth';
import { getProfile } from '@/lib/profiles';
import { getEventsByTeacher, type CloudEvent } from '@/lib/events';
import {
  getAdminAttendanceRecords,
  type AdminAttendanceRecord,
} from '@/lib/attendance';

type EventReport = {
  event: CloudEvent;
  total: number;
  present: number;
  late: number;
};

export default function ReportsScreen() {
  const { user, loading: authLoading } = useAuth();

  const [role, setRole] = useState<string | null>(null);
  const [events, setEvents] = useState<CloudEvent[]>([]);
  const [records, setRecords] = useState<AdminAttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadReports = useCallback(async () => {
    if (authLoading) return;

    if (!user) {
      setEvents([]);
      setRecords([]);
      setRole(null);
      setErrorMessage('Please log in to view reports.');
      setLoading(false);
      setRefreshing(false);
      router.replace('/login');
      return;
    }

    try {
      setErrorMessage(null);

      const profile = await getProfile(user.id);

      if (!profile) {
        setRole(null);
        setEvents([]);
        setRecords([]);
        setErrorMessage('Unable to verify your account role.');
        return;
      }

      setRole(profile.role);

      if (profile.role !== 'admin') {
        setEvents([]);
        setRecords([]);
        setErrorMessage('Access denied. Reports are for administrators only.');
        return;
      }

      const [eventResult, attendanceResult] = await Promise.all([
        getEventsByTeacher(user.id),
        getAdminAttendanceRecords(),
      ]);

      setEvents(eventResult);
      setRecords(attendanceResult);
    } catch (error) {
      console.error('Could not load reports:', error);

      setEvents([]);
      setRecords([]);
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'Could not load reports. Please try again.'
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id, authLoading]);

  useFocusEffect(
    useCallback(() => {
      void loadReports();
    }, [loadReports])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReports();
  };

  const presentCount = records.filter(
    (record) => record.status?.toLowerCase() === 'present'
  ).length;

  const lateCount = records.filter(
    (record) => record.status?.toLowerCase() === 'late'
  ).length;

  const eventReports: EventReport[] = events.map((event) => {
    const eventRecords = records.filter(
      (record) => record.eventId === event.id
    );

    return {
      event,
      total: eventRecords.length,
      present: eventRecords.filter(
        (record) => record.status?.toLowerCase() === 'present'
      ).length,
      late: eventRecords.filter(
        (record) => record.status?.toLowerCase() === 'late'
      ).length,
    };
  });

  const formatDate = (value: string | null) => {
    if (!value) return 'Not set';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return 'Date unavailable';

    return date.toLocaleString();
  };

  if (authLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (role !== 'admin') {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Access Denied</Text>
        <Text style={styles.subtitle}>
          System Reports are available to administrators only.
        </Text>
        {errorMessage && (
          <Text style={styles.errorText}>{errorMessage}</Text>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>System Reports</Text>
      <Text style={styles.subtitle}>
        View event information and attendance summaries.
      </Text>

      {errorMessage && (
        <Text style={styles.errorText}>{errorMessage}</Text>
      )}

      <FlatList
        data={eventReports}
        keyExtractor={(item) => item.event.id}
        contentContainerStyle={
          eventReports.length === 0
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
        ListHeaderComponent={
          <View>
            <View style={styles.summaryCard}>
              <Text style={styles.summaryLabel}>Total Events</Text>
              <Text style={styles.summaryValue}>{events.length}</Text>

              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Attendance Records</Text>
                  <Text style={styles.statValue}>{records.length}</Text>
                </View>

                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Present</Text>
                  <Text style={styles.presentValue}>{presentCount}</Text>
                </View>

                <View style={styles.statItem}>
                  <Text style={styles.statLabel}>Late</Text>
                  <Text style={styles.lateValue}>{lateCount}</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>Event Attendance Summary</Text>
          </View>
        }
        ListEmptyComponent={
          <Text style={styles.emptyText}>No events found.</Text>
        }
        renderItem={({ item }) => (
          <View style={styles.eventCard}>
            <Text style={styles.eventTitle}>
              {item.event.title || 'Untitled Event'}
            </Text>

            <Text style={styles.detail}>
              Event Code: {item.event.event_code || 'N/A'}
            </Text>

            <Text style={styles.detail}>
              Start: {formatDate(item.event.start_time)}
            </Text>

            <Text style={styles.detail}>
              End: {formatDate(item.event.end_time)}
            </Text>

            <Text style={styles.detail}>
              Event Status: {item.event.status?.toUpperCase() ?? 'UNKNOWN'}
            </Text>

            <View style={styles.eventStatsRow}>
              <View style={styles.eventStat}>
                <Text style={styles.eventStatLabel}>Total Attendance</Text>
                <Text style={styles.eventStatValue}>{item.total}</Text>
              </View>

              <View style={styles.eventStat}>
                <Text style={styles.eventStatLabel}>Present</Text>
                <Text style={styles.presentValue}>{item.present}</Text>
              </View>

              <View style={styles.eventStat}>
                <Text style={styles.eventStatLabel}>Late</Text>
                <Text style={styles.lateValue}>{item.late}</Text>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: 20,
  },
  center: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    textAlign: 'center',
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
  statsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  statItem: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  statValue: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
  presentValue: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.primary,
    marginTop: 4,
  },
  lateValue: {
    fontSize: 21,
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
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContainer: {
    flexGrow: 1,
  },
  emptyText: {
    color: COLORS.textSecondary,
    textAlign: 'center',
    padding: 20,
  },
  eventCard: {
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
  eventStatsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  eventStat: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
  },
  eventStatLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
  },
  eventStatValue: {
    fontSize: 21,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 4,
  },
});