import { APP_TIME_ZONE } from "@/features/schedules/utils/scheduleDates";

export const ATTENDANCE_PHASE = Object.freeze({
  SUBSTITUTION_REQUESTED: "substitution-requested",
  NEEDS_CONFIRMATION: "needs-confirmation",
  CONFIRMATION_MISSED: "confirmation-missed",
  WAITING_CHECK_IN: "waiting-check-in",
  CHECK_IN_OPEN: "check-in-open",
  CHECK_IN_CLOSED: "check-in-closed",
  CHECKED_IN: "checked-in",
});

const clock = new Intl.DateTimeFormat("pt-BR", {
  timeZone: APP_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export const formatClock = (isoDate) => clock.format(new Date(isoDate));

export function attendancePhaseOf({
  assignment,
  scheduleAt,
  checkIn,
  nowMs,
}) {
  if (assignment.checkedInAt) return ATTENDANCE_PHASE.CHECKED_IN;
  if (assignment.changeStatus === "REQUESTED") {
    return ATTENDANCE_PHASE.SUBSTITUTION_REQUESTED;
  }
  if (!assignment.confirmedAt) {
    return nowMs < Date.parse(scheduleAt)
      ? ATTENDANCE_PHASE.NEEDS_CONFIRMATION
      : ATTENDANCE_PHASE.CONFIRMATION_MISSED;
  }
  if (!checkIn || nowMs < Date.parse(checkIn.opensAt)) {
    return ATTENDANCE_PHASE.WAITING_CHECK_IN;
  }
  if (nowMs <= Date.parse(checkIn.closesAt)) {
    return ATTENDANCE_PHASE.CHECK_IN_OPEN;
  }
  return ATTENDANCE_PHASE.CHECK_IN_CLOSED;
}

export function isAttendanceOver(phase) {
  return (
    phase === ATTENDANCE_PHASE.CHECK_IN_CLOSED ||
    phase === ATTENDANCE_PHASE.CONFIRMATION_MISSED
  );
}
