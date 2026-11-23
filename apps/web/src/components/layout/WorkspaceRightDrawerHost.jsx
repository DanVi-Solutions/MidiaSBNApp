"use client";

import { MinistryAssignLeaderDrawer } from "@/features/ministries/components/MinistryAssignLeaderDrawer";
import { MinistryFormDrawer } from "@/features/ministries/components/MinistryFormDrawer";
import { ParticipantFormDrawer } from "@/features/participants/components/ParticipantFormDrawer";
import { RecurringEventFormDrawer } from "@/features/recurring-events/components/RecurringEventFormDrawer";
import { AutoAssignDrawer } from "@/features/schedules/components/AutoAssignDrawer";
import { ScheduleFormDrawer } from "@/features/schedules/components/ScheduleFormDrawer";
import { SubstitutionDrawer } from "@/features/schedules/components/SubstitutionDrawer";

export function WorkspaceRightDrawerHost({ activeDrawer, onCloseDrawer }) {
  if (!activeDrawer?.type) return null;

  const { type, key, payload = {} } = activeDrawer;
  const handleClose = () => onCloseDrawer?.(key);

  switch (type) {
    case "ministry-form":
      return (
        <MinistryFormDrawer
          key={key}
          mode={payload.mode}
          ministry={payload.ministry}
          onClose={handleClose}
        />
      );
    case "ministry-assign":
      return (
        <MinistryAssignLeaderDrawer
          key={key}
          ministryId={payload.ministryId}
          onClose={handleClose}
        />
      );
    case "participant-form":
      return (
        <ParticipantFormDrawer
          key={key}
          mode={payload.mode}
          participant={payload.participant}
          preset={payload.preset}
          onCreated={payload.onCreated}
          onClose={handleClose}
        />
      );
    case "recurring-event-form":
      return (
        <RecurringEventFormDrawer
          key={key}
          mode={payload.mode}
          event={payload.event}
          onClose={handleClose}
        />
      );
    case "substitution":
      return (
        <SubstitutionDrawer
          key={key}
          request={payload.request}
          onClose={handleClose}
        />
      );
    case "schedule-form":
      return (
        <ScheduleFormDrawer
          key={key}
          mode={payload.mode}
          event={payload.event}
          scheduleWindow={payload.scheduleWindow}
          onClose={handleClose}
        />
      );
    case "auto-assign":
      return (
        <AutoAssignDrawer
          key={key}
          schedules={payload.schedules}
          onClose={handleClose}
        />
      );
    default:
      return null;
  }
}
