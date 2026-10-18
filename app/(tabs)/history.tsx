
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
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
import {
  getAttendanceHistory,
  getTeacherEventAttendance,
  type AttendanceRecord,
  type TeacherEventAttendance,
} from '@/lib/attendance';
import { getProfile, type Role } from '@/lib/profiles';

function shortId(id: string) {
  return id ? `…${id.slice(-8)}` : 'Unknown student';
}

function formatTime(iso: string) {
  if (!iso) return 'Time unavailable';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';

  return date.toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatDate(iso: string) {
  if (!iso) return 'Date unavailable';

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';

  return date.toLocaleString();
}

function formatStatus(status?: string) {
  return status?.toLowerCase() === 'late' ? 'LATE' : 'PRESENT';
}

export default function HistoryScreen() {
  const { user } = useAuth();

  const [role, setRole] = useState<Role | null>(null);
  const [studentRecords, setStudentRecords] = useState<AttendanceRecord[]>([]);
  const [teacherEvents, setTeacherEvents] = useState<TeacherEventAttendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRecords = useCallback(
    async (isRefresh = false) => {
      if (!user) {
        setRole(null);
        setStudentRecords([]);
        setTeacherEvents([]);
        setErrorMessage('Please log in to view attendance records.');
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      setErrorMessage(null);

      try {
        const profile = await getProfile(user.id);

        if (!profile) {
          setRole(null);
          setStudentRecords([]);
          setTeacherEvents([]);
          setErrorMessage(
            'Could not load your account profile. Please try again.'
          );
          return;
        }

        setRole(profile.role);

        if (profile.role === 'teacher') {
          const events = await getTeacherEventAttendance(user.id);
          setTeacherEvents(events);
          setStudentRecords([]);
        } else if (profile.role === 'student') {
          const records = await getAttendanceHistory(user.id);
          setStudentRecords(records);
          setTeacherEvents([]);
        } else {
          setStudentRecords([]);
          setTeacherEvents([]);
        }
      } catch (error) {
        console.error('Could not load attendance history:', error);
        setErrorMessage('Could not load records. Please try again.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [user]
  );

  useFocusEffect(
    useCallback(() => {
      void loadRecords();
    }, [loadRecords])
  );

  const isTeacher = role === 'teacher';
  const isAdmin = role === 'admin';

  if (loading && role === null && !errorMessage) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.subtitle}>Loading attendance records...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>
        {isTeacher
          ? 'Teacher Attendance Register'
          : isAdmin
            ? 'Admin Account'
            : 'Attendance History'}
      </Text>

      {errorMessage && (
        <View style={styles.messageCard}>
          <Text style={styles.errorText}>{errorMessage}</Text>
          <Text
            style={styles.retryText}
            onPress={() => void loadRecords()}
          >
            Tap here to try again.
          </Text>
        </View>
      )}

      {loading && role !== null ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={COLORS.primary} />
          <Text style={styles.subtitle}>Loading records...</Text>
        </View>
      ) : isAdmin ? (
        <Text style={styles.emptyText}>
          Attendance history is not displayed for admin accounts on this
          screen.
        </Text>
      ) : isTeacher ? (
        <FlatList
          data={teacherEvents}
          keyExtractor={(item) => item.eventId}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadRecords(true)}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            !errorMessage ? (
              <Text style={styles.emptyText}>
                No events or attendance records found.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const presentCount = item.attendees.filter(
              (att) => att.status?.toLowerCase() === 'present'
            ).length;

            const lateCount = item.attendees.filter(
              (att) => att.status?.toLowerCase() === 'late'
            ).length;

            return (
              <View style={styles.card}>
                <Text style={styles.eventTitle}>{item.title}</Text>
                <Text style={styles.eventMeta}>Code: {item.eventCode}</Text>

                <Text style={styles.attendeeHeading}>
                  Attendance Summary
                </Text>

                <View style={styles.summaryContainer}>
                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>
                      Total Attendees
                    </Text>
                    <Text style={styles.summaryNumber}>
                      {item.attendeeCount}
                    </Text>
                  </View>

                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>Present</Text>
                    <Text style={[styles.summaryNumber, styles.presentText]}>
                      {presentCount}
                    </Text>
                  </View>

                  <View style={styles.summaryBox}>
                    <Text style={styles.summaryLabel}>Late</Text>
                    <Text style={[styles.summaryNumber, styles.lateText]}>
                      {lateCount}
                    </Text>
                  </View>
                </View>

                <Text style={styles.attendeeHeading}>
                  Attendees ({item.attendeeCount})
                </Text>

                {item.attendees.length === 0 ? (
                  <Text style={styles.emptyAttendees}>
                    No students have registered attendance for this event yet.
                  </Text>
                ) : (
                  item.attendees.map((att, index) => {
                    const isLate = att.status?.toLowerCase() === 'late';

                    return (
                      <View
                        key={`${att.studentId}-${att.scannedAt}-${index}`}
                        style={styles.attendeeRow}
                      >
                        <View style={styles.teacherAttendeeHeader}>
                          <View style={styles.teacherStudentInfo}>
                            <Text style={styles.studentLabel}>Student</Text>
                            <Text style={styles.studentName}>
                              {att.studentName || shortId(att.studentId)}
                            </Text>
                          </View>

                          <View
                            style={[
                              styles.statusBadge,
                              styles.teacherStatusBadge,
                              isLate
                                ? styles.lateBadge
                                : styles.presentBadge,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusText,
                                isLate
                                  ? styles.lateText
                                  : styles.presentText,
                              ]}
                            >
                              {formatStatus(att.status)}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.scannedText}>
                          Scanned: {formatTime(att.scannedAt)}
                        </Text>
                      </View>
                    );
                  })
                )}
              </View>
            );
          }}
        />
      ) : (
        <FlatList
          data={studentRecords}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => void loadRecords(true)}
              tintColor={COLORS.primary}
            />
          }
          ListEmptyComponent={
            !errorMessage ? (
              <Text style={styles.emptyText}>
                No records yet. Scan an event QR code to register your
                attendance.
              </Text>
            ) : null
          }
          renderItem={({ item }) => {
            const isLate = item.status?.toLowerCase() === 'late';

            return (
              <View style={styles.card}>
                <View style={styles.studentEventHeader}>
                  <Text style={styles.studentEventTitle}>
                    {item.eventTitle}
                  </Text>

                  <View
                    style={[
                      styles.statusBadge,
                      styles.studentStatusBadge,
                      isLate ? styles.lateBadge : styles.presentBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusText,
                        isLate ? styles.lateText : styles.presentText,
                      ]}
                    >
                      {formatStatus(item.status)}
                    </Text>
                  </View>
                </View>

                <Text style={styles.eventMeta}>
                  Event code: {item.eventId}
                </Text>
                <Text style={styles.eventMeta}>
                  Recorded: {formatDate(item.scannedAt)}
                </Text>
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
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  centerContainer: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 16,
  },

  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginTop: 8,
  },

  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 12,
  },

  list: {
    paddingBottom: 24,
    flexGrow: 1,
  },

  emptyText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 21,
    marginTop: 24,
  },

  messageCard: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
  },

  errorText: {
    fontSize: 14,
    color: '#B3261E',
    lineHeight: 20,
  },

  retryText: {
    fontSize: 14,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 8,
  },

  card: {
    backgroundColor: COLORS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 16,
    marginBottom: 12,
  },

  eventTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginBottom: 4,
  },

  studentEventHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 4,
  },

  studentEventTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  studentStatusBadge: {
    marginTop: 0,
    flexShrink: 0,
  },

  eventMeta: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 3,
  },

  attendeeHeading: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textPrimary,
    marginTop: 16,
    marginBottom: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  summaryContainer: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
    marginBottom: 8,
  },

  summaryBox: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },

  summaryLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 6,
  },

  summaryNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.textPrimary,
  },

  emptyAttendees: {
    fontSize: 13,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },

  attendeeRow: {
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },

  teacherAttendeeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },

  teacherStudentInfo: {
    flex: 1,
  },

  teacherStatusBadge: {
    marginTop: 0,
    flexShrink: 0,
  },

  studentLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSecondary,
    marginBottom: 2,
  },

  studentName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textPrimary,
    lineHeight: 20,
  },

  scannedText: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 4,
  },

  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 6,
    marginTop: 8,
  },

  presentBadge: {
    backgroundColor: '#DDF3E4',
  },

  lateBadge: {
    backgroundColor: '#FCE8D5',
  },

  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },

  presentText: {
    color: '#216E39',
  },

  lateText: {
    color: '#9A4D00',
  },
});
