# Shared Context and Cross-Navigation

The Developer Tools keep one investigation context while you move between
workspaces. The narrow strip below the toolbar shows the confirmed world and
the subjects that the current investigation relates to.

For example:

```text
DevTools Audit / Norn “Ada” / Agent #422 / Room 680 / Chemical 149
```

The orange-edged segment is the **primary subject**. Other segments are
**related selections**. Selecting a chemical can therefore make that chemical
primary without discarding the creature whose chemistry you are examining.
The tick at the right is the current observed world tick, not the capture tick
of every individual panel.

![A selected disposable Norn in Firefox with world, creature, agent, room, and
metaroom segments visible in the shared context
strip](/docs/images/observatory/shared-context-creature-firefox.png)

## Using the Context Strip

- Activate a segment to open the workspace that owns that kind of subject.
- Activate its × control to remove only that segment.
- Use **Back** to restore the previous in-tool investigation. This restores the
  prior workspace, shared selections, filters, and recorded scroll position.
- Native browser Back and Forward perform the same restoration.
- Segment buttons and their clear controls are keyboard accessible with Tab
  and Enter or Space.
- Hover or focus a segment for a short explanation of its scope and target.

The world segment cannot be cleared independently because all world-scoped
objects need a confirmed world. Global concepts such as a chemical number or
classifier may remain selected across worlds; agents, creatures, rooms,
scripts, living structures, genomes, log records, and timeline events do not.

## Supported Handoffs

| From | Action | Preserved identifiers |
|---|---|---|
| Creatures | Select a creature | World, moniker, agent ID and classifier, room, metaroom |
| Creature summary | Active script | Creature and agent context; Debugger resolves the currently observed VM |
| Creature summary | Brain, Chemistry, Organs, Genome | Creature and agent context plus the selected subview |
| Chemistry | Select a concentration row | Creature remains related; chemical ID and name become primary |
| Scripts | Open in Debugger | Agent ID/classifier/gallery and script classifier/event |
| Debugger | Select an agent | Agent identity and the currently observed script/event |
| Log | Inspect agent/event | Log record ID, parsed agent identity, and script/event where the engine message supplies them |
| Docs or tooltip | Follow a documentation link | Current world/subject context and the internal document/section |

Log correlation is deliberately conservative. An inspector action is only
shown when the engine message contains an explicit agent ID. Script context is
added only when the message also contains an explicit script classifier.
Ordinary prose is not guessed into a target.

## Identity, Invalidation, and Missing Targets

World-scoped keys combine the world identity with the local ID. A world load
clears those selections before new-world data renders. Returning through
history to a link from another world produces a clear historical-context
message rather than selecting an object in the new world.

Numeric agent IDs can eventually be reused. Creature monikers and available
agent classifier/gallery fields are retained as an identity fingerprint in
the route and history entry. If an endpoint reports a different identity, the
Debugger displays **MISSING** and retains the historical segment; it does not
silently follow the new object. A deleted or dead agent is handled the same
way.

## Deep Links

In-tool routes use a `#observe?` fragment. A route carries a named destination
plus the active tab/view, world, primary kind, stable selection identifiers,
and optional retained world-tick cursor or range, for example:

```text
#observe?route=debugger&tab=debugger&view=script&world=DevTools+Audit&primary=script&agent=422&script=422%3A3%3A4%3A0%3A9&event=9&af=4&ag=1&as=1
#observe?route=compare&tab=compare&world=DevTools+Audit&primary=creature&at=1200&from=1000&to=1300&creature=422
```

Links are safe to bookmark within the same world. If another world is active,
the route is rejected visibly. The context strip renders a retained range as a
non-editable `Ticks 1000–1300` segment. The earlier flat hashes such as
`#creatures` and `#console`, and the `#docs/filename.md` form, remain accepted.
See [Observatory Navigation and Dashboard](observatory_navigation_dashboard.md)
for the route map and complete migration table.

## Persistence and Pinning

Shared selections persist while the current world remains active and are
recorded in browser history. They are session-local: reloading a normal page
without an observatory route starts with world-only context.

There is no separate long-lived **pin** collection in this foundation. Related
segments serve as the current investigation's retained context, and each can
be cleared independently. Stable monitoring pins and retained sample histories
are introduced by the biological time-series workspace; the context strip
does not imply that a live value has been recorded.

## Freshness Boundary

The context strip identifies targets and the current world tick. It does not
make values from separate endpoints simultaneous. Read each panel's evidence
and freshness labels, especially while the engine is running. Pausing the
simulation freezes world ticks, but browser APIs and navigation remain active.
