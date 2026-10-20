
import { supabase } from './supabase';
import { parseQRPayload } from './qr';

export type AttendanceRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  scannedAt: string;
  status: string;
};

export type RegisterResult = {
  success: boolean;
  message: string;
  eventTitle?: string;
  status?: string;
};

type RegisterAttendanceResponse = {
  success?: boolean;
  code?: string;
  message?: string;
  eventTitle?: string;
  status?: string;
};

export async function registerAttendance(
  rawPayload: string,
  studentId: string
): Promise<RegisterResult> {
  const parsed = parseQRPayload(rawPayload);

  if (!parsed.ok) {
    return { success: false, message: parsed.message };
  }

  if (!studentId || studentId === 'unknown') {
    return {
      success: false,
      message: 'Please log in before scanning attendance.',
    };
  }

  try {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user || user.id !== studentId) {
      return {
        success: false,
        message: 'Please log in with your student account.',
      };
    }

    const { data, error } = await supabase.rpc(
      'register_attendance',
      { p_event_code: parsed.payload.event }
    );

    if (error) {
      console.error('Attendance registration failed:', error.message);
      return {
        success: false,
        message: 'Could not record attendance. Please try again.',
      };
    }

    const result = data as RegisterAttendanceResponse;

    if (result?.success === true) {
      return {
        success: true,
        message: result.message ?? 'Attendance recorded!',
        eventTitle: result.eventTitle,
        status: result.status,
      };
    }

    const messages: Record<string, string> = {
      unauthorized: 'Only students can record attendance.',
      invalid_qr: 'Invalid QR code. Please scan a valid event QR code.',
      closed: 'This event is closed.',
      not_started: 'Event has not started yet.',
      ended: 'This event has already ended.',
      duplicate: 'Already registered for this event.',
    };

    return {
      success: false,
      message:
        messages[result?.code ?? ''] ??
        result?.message ??
        'Could not record attendance. Please try again.',
      eventTitle: result?.eventTitle,
      status: result?.status,
    };
  } catch (error) {
    console.error('Unexpected attendance error:', error);
    return {
      success: false,
      message: 'Something went wrong. Please try again.',
    };
  }
}

export async function getAttendanceHistory(
  studentId: string
): Promise<AttendanceRecord[]> {
  if (!studentId || studentId === 'unknown') return [];

  const { data, error } = await supabase
    .from('attendance')
    .select('id, scanned_at, status, events ( event_code, title )')
    .eq('student_id', studentId)
    .order('scanned_at', { ascending: false });

  if (error || !data) {
    console.error('Could not load attendance history:', error?.message);
    return [];
  }

  return data.map((row: any) => ({
    id: row.id,
    eventId: row.events?.event_code ?? '',
    eventTitle: row.events?.title ?? '',
    scannedAt: row.scanned_at,
    status: row.status ?? 'present',
  }));
}

export type TeacherEventAttendance = {
  eventId: string;
  eventCode: string;
  title: string;
  startTime: string | null;
  endTime: string | null;
  attendeeCount: number;
  attendees: {
    studentId: string;
    studentName: string;
    scannedAt: string;
    status: string;
  }[];
};

export async function getTeacherEventAttendance(
  teacherId: string
): Promise<TeacherEventAttendance[]> {
  if (!teacherId) return [];

  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, start_time, end_time, created_at')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) {
    console.error('Could not load teacher events:', eventError?.message);
    return [];
  }

  if (events.length === 0) return [];

  const eventIds = events.map((event: any) => event.id);

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select(`
      student_id,
      scanned_at,
      event_id,
      status,
      profiles (
        full_name,
        email
      )
    `)
    .in('event_id', eventIds)
    .order('scanned_at', { ascending: false });

  if (attendanceError || !attendance) {
    console.error(
      'Could not load event attendees:',
      attendanceError?.message
    );
    return [];
  }

  return events.map((event: any) => {
    const rows = attendance.filter(
      (record: any) => record.event_id === event.id
    );

    return {
      eventId: event.id,
      eventCode: event.event_code,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      attendeeCount: rows.length,
      attendees: rows.map((record: any) => ({
        studentId: record.student_id,
        studentName:
          record.profiles?.full_name ||
          record.profiles?.email ||
          'Unknown student',
        scannedAt: record.scanned_at,
        status: record.status ?? 'present',
      })),
    };
  });
}

export type TeacherEventSummary = {
  eventId: string;
  eventCode: string;
  title: string;
  attendeeCount: number;
};

export async function getTeacherEventSummary(
  teacherId: string
): Promise<TeacherEventSummary[]> {
  if (!teacherId) return [];

  const { data: events, error: eventError } = await supabase
    .from('events')
    .select('id, event_code, title, created_at')
    .eq('created_by', teacherId)
    .order('created_at', { ascending: false });

  if (eventError || !events) {
    console.error('Could not load event summary:', eventError?.message);
    return [];
  }

  if (events.length === 0) return [];

  const eventIds = events.map((event: any) => event.id);

  const { data: attendanceRows, error: attendanceError } =
    await supabase
      .from('attendance')
      .select('event_id')
      .in('event_id', eventIds);

  if (attendanceError || !attendanceRows) {
    console.error(
      'Could not load attendance counts:',
      attendanceError?.message
    );
    return [];
  }

  const counts: Record<string, number> = {};

  attendanceRows.forEach((record: any) => {
    counts[record.event_id] = (counts[record.event_id] ?? 0) + 1;
  });

  return events.map((event: any) => ({
    eventId: event.id,
    eventCode: event.event_code,
    title: event.title,
    attendeeCount: counts[event.id] ?? 0,
  }));
}

export type AdminAttendanceRecord = {
  id: string;
  eventId: string;
  eventCode: string;
  eventTitle: string;
  studentId: string;
  studentName: string;
  scannedAt: string;
  status: string;
};

export async function getAdminAttendanceRecords(): Promise<
  AdminAttendanceRecord[]
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Not logged in.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError) {
    throw new Error(`Could not check your role: ${profileError.message}`);
  }

  if (profile?.role !== 'admin') {
    throw new Error(
      `This account is not an admin (role: ${profile?.role ?? 'unknown'}).`
    );
  }

  const { data: attendance, error } = await supabase
    .from('attendance')
    .select(`
      id,
      event_id,
      student_id,
      scanned_at,
      status,
      events (
        event_code,
        title
      ),
      profiles (
        full_name,
        email
      )
    `)
    .order('scanned_at', { ascending: false });

  if (error) {
    throw new Error(`Query failed: ${error.message}`);
  }

  return (attendance ?? []).map((record: any) => ({
    id: record.id,
    eventId: record.event_id,
    eventCode: record.events?.event_code ?? '',
    eventTitle: record.events?.title ?? '',
    studentId: record.student_id,
    studentName:
      record.profiles?.full_name?.trim() ||
      record.profiles?.email ||
      'Unknown student',
    scannedAt: record.scanned_at,
    status: record.status ?? 'present',
  }));
}

export async function updateAdminAttendanceStatus(
  attendanceId: string,
  newStatus: 'present' | 'late',
  reason: string
): Promise<void> {
  if (!attendanceId) {
    throw new Error('Attendance record ID is required.');
  }

  if (newStatus !== 'present' && newStatus !== 'late') {
    throw new Error('Invalid attendance status.');
  }

  if (!reason.trim()) {
    throw new Error('Please provide a reason for the correction.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Please log in first.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only administrators can correct attendance records.');
  }

  const { error } = await supabase.rpc(
    'admin_update_attendance_status',
    {
      target_attendance_id: attendanceId,
      new_status: newStatus,
      reason: reason.trim(),
    }
  );

  if (error) {
    throw new Error(error.message);
  }
}

export type CorrectionRequestStatus = 'pending' | 'approved' | 'rejected';

export type AttendanceCorrectionRequest = {
  id: string;
  attendanceId: string;
  eventTitle: string;
  eventStartTime: string | null;
  scannedAt: string | null;
  currentStatus: string;
  requestedStatus: 'present' | 'late';
  reason: string;
  status: CorrectionRequestStatus;
  adminNote: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export type AdminCorrectionRequest = AttendanceCorrectionRequest & {
  studentId: string;
  studentName: string;
};

export async function submitAttendanceCorrectionRequest(
  attendanceId: string,
  requestedStatus: 'present' | 'late',
  reason: string
): Promise<void> {
  const trimmedReason = reason.trim();

  if (!attendanceId) {
    throw new Error('Attendance record is required.');
  }

  if (requestedStatus !== 'present' && requestedStatus !== 'late') {
    throw new Error('Invalid requested attendance status.');
  }

  if (!trimmedReason) {
    throw new Error('Please enter a reason for your request.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Please log in first.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'student') {
    throw new Error('Only students can submit attendance correction requests.');
  }

  const { data: attendance, error: attendanceError } = await supabase
    .from('attendance')
    .select('id, student_id')
    .eq('id', attendanceId)
    .eq('student_id', user.id)
    .maybeSingle();

  if (attendanceError || !attendance) {
    throw new Error('This attendance record was not found in your account.');
  }

  const { data: existing, error: existingError } = await supabase
    .from('attendance_correction_requests')
    .select('id')
    .eq('attendance_id', attendanceId)
    .eq('student_id', user.id)
    .eq('status', 'pending')
    .limit(1);

  if (existingError) {
    throw new Error(
      `Could not check existing requests: ${existingError.message}`
    );
  }

  if (existing && existing.length > 0) {
    throw new Error('You already have a pending request for this attendance.');
  }

  const { error } = await supabase
    .from('attendance_correction_requests')
    .insert({
      attendance_id: attendanceId,
      student_id: user.id,
      requested_status: requestedStatus,
      reason: trimmedReason,
      status: 'pending',
    });

  if (error) {
    throw new Error(`Could not submit request: ${error.message}`);
  }
}

export async function getMyAttendanceCorrectionRequests(
  studentId: string
): Promise<AttendanceCorrectionRequest[]> {
  if (!studentId) return [];

  const { data, error } = await supabase
    .from('attendance_correction_requests')
    .select(`
      id,
      attendance_id,
      requested_status,
      reason,
      status,
      admin_note,
      created_at,
      reviewed_at,
      attendance (
        status,
        scanned_at,
        events (
          title,
          start_time
        )
      )
    `)
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error(
      `Could not load your correction requests: ${error.message}`
    );
  }

  return (data ?? []).map((row: any) => ({
    id: row.id,
    attendanceId: row.attendance_id,
    eventTitle: row.attendance?.events?.title ?? 'Unknown event',
    eventStartTime: row.attendance?.events?.start_time ?? null,
    scannedAt: row.attendance?.scanned_at ?? null,
    currentStatus: row.attendance?.status ?? 'unknown',
    requestedStatus: row.requested_status,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note ?? null,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
  }));
}

export async function getAdminCorrectionRequests(): Promise<
  AdminCorrectionRequest[]
> {
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Please log in first.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only administrators can view correction requests.');
  }

  const { data: requests, error: requestError } = await supabase
    .from('attendance_correction_requests')
    .select(`
      id,
      attendance_id,
      student_id,
      requested_status,
      reason,
      status,
      admin_note,
      created_at,
      reviewed_at,
      attendance (
        status,
        scanned_at,
        events (
          title,
          start_time
        )
      )
    `)
    .order('created_at', { ascending: false });

  if (requestError) {
    throw new Error(
      `Could not load correction requests: ${requestError.message}`
    );
  }

  const rows = requests ?? [];

  if (rows.length === 0) return [];

  const studentIds = [
    ...new Set(rows.map((row: any) => row.student_id)),
  ];

  const { data: students, error: studentsError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', studentIds);

  if (studentsError) {
    throw new Error(
      `Could not load correction request students: ${studentsError.message}`
    );
  }

  const studentMap = new Map(
    (students ?? []).map((student: any) => [
      student.id,
      student.full_name?.trim() ||
        student.email ||
        'Unknown student',
    ])
  );

  return rows.map((row: any) => ({
    id: row.id,
    attendanceId: row.attendance_id,
    studentId: row.student_id,
    studentName:
      studentMap.get(row.student_id) ?? 'Unknown student',
    eventTitle: row.attendance?.events?.title ?? 'Unknown event',
    eventStartTime:
      row.attendance?.events?.start_time ?? null,
    scannedAt: row.attendance?.scanned_at ?? null,
    currentStatus: row.attendance?.status ?? 'unknown',
    requestedStatus: row.requested_status,
    reason: row.reason,
    status: row.status,
    adminNote: row.admin_note ?? null,
    createdAt: row.created_at,
    reviewedAt: row.reviewed_at ?? null,
  }));
}

export async function reviewAttendanceCorrectionRequest(
  requestId: string,
  decision: 'approved' | 'rejected',
  reviewNote?: string
): Promise<void> {
  if (!requestId) {
    throw new Error('Correction request ID is required.');
  }

  if (decision !== 'approved' && decision !== 'rejected') {
    throw new Error('Invalid review decision.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Please log in first.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || profile?.role !== 'admin') {
    throw new Error('Only administrators can review correction requests.');
  }

  const { error } = await supabase.rpc('review_attendance_correction', {
    request_id: requestId,
    decision,
    review_note: reviewNote?.trim() || null,
  });

  if (error) {
    throw new Error(error.message);
  }
}
