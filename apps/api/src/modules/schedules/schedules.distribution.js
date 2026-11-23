import { localDateOf } from "../../shared/time/zonedTime.js";

const instantKey = (credentialId, date) => `${credentialId}|${date.getTime()}`;
const dayKey = (credentialId, day) => `${credentialId}|${day}`;

export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

export function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 2 ** 32;
  };
}

function shuffle(items, random) {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

const scarcity = (slot) => slot.candidates.length - slot.needed;

const mostConstrainedFirst = (a, b) => scarcity(a) - scarcity(b) || a.scheduleAt - b.scheduleAt;

export function distribute(slots, { existingAssignments, upcomingLoad, random = Math.random }) {
  const busyInstants = new Set(existingAssignments.map((a) => instantKey(a.credentialId, a.scheduleAt)));
  const commitmentsPerDay = new Map();
  const load = new Map(upcomingLoad);

  const addCommitment = (credentialId, scheduleAt) => {
    const key = dayKey(credentialId, localDateOf(scheduleAt));
    commitmentsPerDay.set(key, (commitmentsPerDay.get(key) ?? 0) + 1);
    busyInstants.add(instantKey(credentialId, scheduleAt));
  };
  existingAssignments.forEach((a) => addCommitment(a.credentialId, a.scheduleAt));

  const sameDayCount = (credentialId, day) => commitmentsPerDay.get(dayKey(credentialId, day)) ?? 0;

  const picksBySlot = new Map();

  for (const slot of [...slots].sort(mostConstrainedFirst)) {
    const day = localDateOf(slot.scheduleAt);
    const pool = shuffle(slot.candidates, random);
    const picks = [];

    while (picks.length < slot.needed) {
      const options = pool.filter(
        (candidate) =>
          !picks.some((pick) => pick.credential.id === candidate.id) &&
          !busyInstants.has(instantKey(candidate.id, slot.scheduleAt)),
      );
      if (options.length === 0) break;

      options.sort(
        (a, b) => sameDayCount(a.id, day) - sameDayCount(b.id, day) || (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0),
      );
      const chosen = options[0];

      picks.push({ credential: chosen, sameDayConflict: sameDayCount(chosen.id, day) > 0 });
      addCommitment(chosen.id, slot.scheduleAt);
      load.set(chosen.id, (load.get(chosen.id) ?? 0) + 1);
    }

    picksBySlot.set(slot.scheduleId, picks);
  }

  return picksBySlot;
}
