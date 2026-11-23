import { MonthlyScheduleView } from "@/features/schedules/components/MonthlyScheduleView";

export const instant = false;

export const metadata = {
  title: "Escala do mês",
};

export default function DashboardPage() {
  return <MonthlyScheduleView />;
}
