"use client";

import { createContext, useContext } from "react";
import {
  ACTIVE_MINISTRY,
  CURRENT_USER,
} from "@/features/schedules/data/mockScheduleData";

export const PrivateWorkspaceContext = createContext({
  unreadCount: 0,
  markNotificationRead: () => {},
  markAllNotificationsRead: () => {},
  activeMinistry: ACTIVE_MINISTRY,
  setActiveMinistry: () => {},
  ministries: [],
  departments: [],
  refreshDepartments: async () => [],
  addMinistry: () => {},
  participants: [],
  isLoadingParticipants: false,
  participantsError: "",
  refreshParticipants: async () => [],
  addParticipant: () => {},
  updateParticipant: () => {},
  deleteParticipant: () => {},
  participantCreatePreset: null,
  setParticipantCreatePreset: () => {},
  knownCredentialNumbers: {},
  rememberCredentialNumber: () => {},
  currentUser: CURRENT_USER,
  refreshCurrentUser: async () => null,
  updateCurrentUser: () => {},
  recurringEvents: [],
  isLoadingRecurringEvents: false,
  recurringEventsError: "",
  refreshRecurringEvents: async () => [],
  addRecurringEvent: () => {},
  deleteRecurringEvent: () => {},
  openWorkspaceDrawer: () => {},
  closeWorkspaceDrawer: () => {},
  schedulesVersion: 0,
  notifySchedulesChanged: () => {},
  openWorkspaceCodeModal: () => {},
});

export function usePrivateWorkspace() {
  return useContext(PrivateWorkspaceContext);
}
