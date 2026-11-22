export const DAY_SLOTS = [
  { id: "allDay", label: "Dia inteiro", tone: "available" },
  { id: "morning", label: "Manhã", tone: "available" },
  { id: "afternoon", label: "Tarde", tone: "available" },
  { id: "evening", label: "Noite", tone: "available" },
  { id: "unavailable", label: "Indisponível", tone: "unavailable" },
];

export const WEEK_DAYS = [
  { id: "mon", label: "Segunda" },
  { id: "tue", label: "Terça" },
  { id: "wed", label: "Quarta" },
  { id: "thu", label: "Quinta" },
  { id: "fri", label: "Sexta" },
  { id: "sat", label: "Sábado" },
  { id: "sun", label: "Domingo" },
];

export const INITIAL_WEEKLY_AVAILABILITY = {
  mon: ["evening"],
  tue: ["evening"],
  wed: ["unavailable"],
  thu: ["morning", "afternoon"],
  fri: ["evening"],
  sat: ["allDay"],
  sun: ["allDay"],
};
