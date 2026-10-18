
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

// Admin: correct an attendance record's status.
export async function updateAdminAttendanceStatus(
  attendanceId: string,
  newStatus: 'present' | 'late'
): Promise<void> {
  if (!attendanceId) {
    throw new Error('Attendance record ID is required.');
  }

  if (newStatus !== 'present' && newStatus !== 'late') {
    throw new Error('Invalid attendance status.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error('Please log in first.');
  }

  const { error } = await supabase.rpc(
    'admin_update_attendance_status',
    {
      target_attendance_id: attendanceId,
      new_status: newStatus,
    }
  );

  if (error) {
    console.error('Could not update attendance status:', error.message);
    throw new Error(error.message);
  }
}
