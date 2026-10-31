# Observatory Glossary and Evidence Legend

## Time and Freshness

- **World tick:** Primary simulation timebase. It advances with the world and
  stops when the simulation is paused.
- **System tick:** Engine process tick. It identifies engine sequencing but
  does not replace world time for biological evidence.
- **Sample time:** World/system tick and wall capture attached to one endpoint
  read. Two panels can be fresh without being simultaneous.
- **Wall-clock time:** Browser or engine real time. It supplements world ticks
  for request age and latency.
- **Fresh:** The latest successful sample is within its documented interval
  threshold.
- **Stale:** A retained value is older than that threshold or the source
  disconnected. Stale evidence is not presented as live.

## Evidence and Authorship

- **Observed:** Direct engine state or a recorded engine event at a stated
  capture context.
- **Derived:** Mechanical calculation from observed values, such as a delta,
  median, IQR, or immediate numeric clamp.
- **Inferred:** Labelled heuristic interpretation with supporting evidence. It
  remains weaker than a direct engine fact.
- **Unknown:** Source, timing, identity, or interpretation is insufficient.
- **User-authored:** A protocol question, hypothesis, note, annotation, source
  edit, or planned action. This is a provenance category, not a fifth evidence
  level. A user-authored claim can still be Inferred or Unknown.

Examples:

| Claim | Label |
|---|---|
| Chemical 75 was `0.42` at tick 1200 | Observed |
| It rose `+0.07` across two retained samples | Derived |
| The creature may be seeking food, supported by drive/attention/action evidence | Inferred |
| The capture tick of a legacy panel value was not recorded | Unknown |
| “Food access affects this action” in an experiment hypothesis | User-authored, Inferred |

## Creature and Neural Terms

- **Drive:** Engine-reported internal drive value. Drive IDs are not chemical
  IDs.
- **Stimulus:** Engine input/update that can affect creature state.
- **Attention:** Current winner in the attention network where directly
  available.
- **Decision:** Current decision-lobe winner where directly available.
- **Action:** Observed action/script state, separate from an interpretation of
  intent.
- **Consequence:** Later observed/derived state change aligned for
  investigation, not proof of causation.
- **Organ state:** Individual organ readings and life-force fields. There is no
  invented aggregate “overall health” score.
- **Life stage:** Engine age stage such as Baby, Child, Youth, Adolescent,
  Adult, Old, or Senile; it is not the same as current life state.

## Chemistry and Ecology

- **Concentration:** Current bounded chemical amount, normally `0..1`.
- **Dose:** Requested signed change to a concentration.
- **CA channel:** One cellular-automata property in the room system.
- **Smell mapping:** World-provided name/category mapping for a CA channel.
- **Gradient:** Difference in sampled CA values across connected rooms.
- **Affordance:** An Inferred possible relationship unless directly reported
  by a specific engine capability.

## CAOS Execution

- **Immediate CAOS execution:** A fresh ownerless VM evaluates source once.
- **Installed event script:** Persistent scriptorium source bound to an exact
  classifier/event and invoked by engine events.
- **Classifier:** Family, genus, species, and (for scripts) event identity.
- **OWNR/TARG:** Script owner and current target. Ownerless evaluation has no
  `OWNR`; `TARG` is present only when explicitly bound.

Use the visible Evidence button or focus a registered item and press F1 to open
the same definitions beside the live context.
