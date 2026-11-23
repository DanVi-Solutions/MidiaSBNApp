import { RecurringEventsView } from "@/features/recurring-events/components/RecurringEventsView";

export const instant = false;

export const metadata = {
  title: "Eventos recorrentes",
};

export default function RecurringEventsPage() {
  return <RecurringEventsView />;
}
