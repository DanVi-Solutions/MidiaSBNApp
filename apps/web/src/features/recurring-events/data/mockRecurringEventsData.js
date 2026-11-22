export const WEEKDAY_OPTIONS = [
  { value: "Domingo", repeatPrefix: "Repete todo" },
  { value: "Segunda-feira", repeatPrefix: "Repete toda" },
  { value: "Terça-feira", repeatPrefix: "Repete toda" },
  { value: "Quarta-feira", repeatPrefix: "Repete toda" },
  { value: "Quinta-feira", repeatPrefix: "Repete toda" },
  { value: "Sexta-feira", repeatPrefix: "Repete toda" },
  { value: "Sábado", repeatPrefix: "Repete todo" },
];

export const MINISTRY_OPTIONS = [
  "Transmissão / Live",
  "Câmeras",
  "Projeção",
  "Fotografia",
  "Som",
  "Social Media",
];

export const INITIAL_RECURRING_EVENTS = [
  {
    id: "rec-culto-celebracao",
    ministryName: "Transmissão / Live",
    title: "Culto de Celebração",
    weekday: "Domingo",
    time: "18:00",
  },
];
