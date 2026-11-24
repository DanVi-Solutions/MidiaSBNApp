const EVENTS_REACHING_AUTOFILL_UI = [
  "input",
  "change",
  "focusin",
  "focusout",
  "keydown",
  "keyup",
  "click",
  "mousedown",
  "mouseup",
  "mousemove",
  "mouseover",
  "mouseout",
  "pointerdown",
  "pointerup",
  "pointermove",
  "pointerover",
  "pointerout",
];

function stopEventFromInaccessibleTarget(event) {
  try {
    void event.target?.nodeType;
  } catch {
    event.stopImmediatePropagation();
  }
}

export function guardAgainstAutofillUiEvents() {
  for (const type of EVENTS_REACHING_AUTOFILL_UI) {
    window.addEventListener(type, stopEventFromInaccessibleTarget, true);
  }
  return () => {
    for (const type of EVENTS_REACHING_AUTOFILL_UI) {
      window.removeEventListener(type, stopEventFromInaccessibleTarget, true);
    }
  };
}
