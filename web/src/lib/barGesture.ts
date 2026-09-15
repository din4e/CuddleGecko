// True while a pointer press is held on any progress bar. Draggable rows
// consult this in their dragstart handler: a native HTML5 drag that begins on
// the scrubber swallows the pointer stream (no pointerup ever reaches the
// bar), so it must be canceled for the percent to commit.
//
// Module-level flag lives here (not in TodoProgressBar) so the component file
// only exports components (react-refresh) and HMR can't leave two divergent
// copies of the state.
let barPressActive = false

export function setBarPressActive(active: boolean): void {
  barPressActive = active
}

export function isBarPressActive(): boolean {
  return barPressActive
}
