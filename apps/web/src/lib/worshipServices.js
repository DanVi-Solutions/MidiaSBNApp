export const WORSHIP_SERVICE_OPTIONS = Object.freeze([
  { value: "SUNDAY_0815", label: "08:15 às 10:00" },
  { value: "SUNDAY_1030", label: "10:30 às 12:00" },
  { value: "SUNDAY_1800", label: "18:00 às 20:00" },
]);

export const worshipServiceLabel = (value) =>
  WORSHIP_SERVICE_OPTIONS.find((option) => option.value === value)?.label ?? "";
