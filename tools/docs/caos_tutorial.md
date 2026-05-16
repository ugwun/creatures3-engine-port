# Beginner's CAOS Scripting Tutorial

Welcome to **CAOS** — the scripting language that controls everything in the Creatures 3 and Docking Station universe. This hands-on tutorial will walk you through CAOS from zero, using the Developer Tools you already have open in your browser.

By the end of this tutorial, you will be able to:

- Execute CAOS commands in the **Console** and the **CAOS IDE**
- Understand variables, conditions, and loops
- Create and manipulate agents in the game world
- Write and inject event scripts into the Scriptorium
- Debug scripts using breakpoints and the Debugger

> **Prerequisites:** The engine must be running with `--tools` and a world must be loaded. Open `http://localhost:9980` in your browser.

---

## Part 1: Your First CAOS Command

### 1.1 — The Console Tab

The quickest way to run CAOS is the **Console** tab — a live command prompt that executes code instantly.

1. Click the **Console** tab in the left sidebar.
2. You'll see an input field at the bottom with a `>` prompt.

![CAOS Console Tab](/docs/media/tab_console_hello_world.png)

Type the following and press **Enter**:

```caos
outs "Hello, World!"
```

You should see:

```
Hello, World!
```

Congratulations — you just ran your first CAOS command! `outs` is the **output string** command. It prints a text string to the output.

### 1.2 — Printing Numbers

CAOS has a separate command for printing numbers. Try:

```caos
outv 5
```

Output:

```
5
```

`outv` is the **output value** command. It prints an integer or float.

What about arithmetic? Unlike most languages, CAOS **does not** support inline expressions like `2 + 3`. Instead, you store a value in a variable and modify it with arithmetic commands:

```caos
setv va00 2 addv va00 3 outv va00
```

Output:

```
5
```

This sets `va00` to `2`, adds `3` to it, then prints the result. We'll cover variables and arithmetic properly in [Part 2](#part-2-variables-and-arithmetic).

> **⚠️ Spaces matter!** CAOS requires a space between **every** token. Writing `setv va00 2 addv va003` (missing space) will cause a parse error. Every command, variable, number, and operator must be separated by whitespace. CAOS is a space-delimited language, not a free-form one like Python or JavaScript.

> **Key concept:** In CAOS, `outs` prints strings and `outv` prints numbers. You cannot mix them — `outs 42` would cause an error because `42` is not a string.

### 1.3 — Exploring the World

Let's ask the engine some questions. Try each of these one at a time:

```caos
outs wnam
```

This prints the **world name** — the name of the currently loaded world.

```caos
outv totl 4 0 0
```

`totl` counts agents matching a classifier. Family `4` is creatures — so this tells you **how many creatures** are currently in the world.

```caos
outv totl 0 0 0
```

Using all zeroes as wildcards, this counts **every agent** in the world. You'll likely see a number in the hundreds — that's all the plants, machines, gadgets, and creatures combined!

### 1.4 — Handling Errors

What happens when you type something wrong? Try:

```caos
outs 42
```

You'll see a red error message:

```
✗ Expected string rvalue at token '42'
```

This is the compiler telling you that `outs` expects a string (like `"hello"`), not a number. CAOS is **strictly typed** — commands accept specific types. Don't worry about memorising every rule; the error messages guide you.

![CAOS Console Tab](/docs/media/tab_console_error.png)

### 1.5 — Command History

Press the **↑** (up arrow) key to recall your previous commands. Press **↓** to go forward. This saves you from retyping — the Console stores up to 200 commands in its history.

---

## Part 2: Variables and Arithmetic

### 2.1 — Local Variables (VA00–VA99)

Variables store values for later use. CAOS gives you 100 local variables named `va00` through `va99`. Use `setv` to assign a numeric value and `outv` to print it:

```caos
setv va00 42 outv va00
```

Output:

```
42
```

> **⚠️ Console gotcha:** In the Console, each command you submit runs in a **fresh** virtual machine. Variables do **not** persist between separate executions. If you try `setv va00 42` and then `outv va00` as two separate commands, you'll get `0` — because the second command starts with a clean slate. Always set and use variables **in the same command** when using the Console. (This limitation doesn't apply in the CAOS IDE or in event scripts.)

### 2.2 — Arithmetic

CAOS uses **prefix** arithmetic commands. Instead of `va00 = va00 + 10`, you write:

```caos
setv va00 10 addv va00 5 outv va00
```

Output:

```
15
```

Here's the complete set:

| Command | Meaning | Example |
|---|---|---|
| `setv` | Set value | `setv va00 10` |
| `addv` | Add | `addv va00 5` → `va00 = va00 + 5` |
| `subv` | Subtract | `subv va00 3` → `va00 = va00 - 3` |
| `mulv` | Multiply | `mulv va00 2` → `va00 = va00 * 2` |
| `divv` | Divide | `divv va00 4` → `va00 = va00 / 4` |
| `modv` | Modulus | `modv va00 3` → `va00 = va00 % 3` |

### 2.3 — Random Numbers

The `rand` command generates a random integer in a range (inclusive):

```caos
setv va00 rand 1 6 outv va00
```

This rolls a virtual die — output will be a number from 1 to 6.

### 2.4 — Strings

For string variables, use `sets` instead of `setv`:

```caos
sets va00 "Hello" adds va00 " World" outs va00
```

Output:

```
Hello World
```

`adds` **appends** a string to an existing string variable. Notice we use `sets` (not `setv`) because we're storing a string, not a number.

### 2.5 — Combining Text and Numbers

CAOS doesn't have string interpolation, so to print text and numbers together, call `outs` and `outv` in sequence:

```caos
setv va00 42 outs "The answer is: " outv va00
```

Output:

```
The answer is: 42
```

You can also convert numbers to strings with `vtos`:

```caos
setv va00 42 sets va01 "Value=" adds va01 vtos va00 outs va01
```

Output:

```
Value=42
```

---

## Part 3: Conditions and Loops

### 3.1 — DOIF / ENDI — Conditional Blocks

`doif` lets you run code only when a condition is true:

```caos
setv va00 rand 1 100 doif va00 gt 50 outs "High roll: " outv va00 else outs "Low roll: " outv va00 endi
```

This generates a random number and prints whether it's high or low. The condition operators are:

| Operator | Meaning |
|---|---|
| `eq` | Equal (=) |
| `ne` | Not equal (≠) |
| `gt` | Greater than (>) |
| `ge` | Greater or equal (≥) |
| `lt` | Less than (<) |
| `le` | Less or equal (≤) |

You can combine conditions with `and` / `or`:

```caos
doif 5 gt 3 and 10 lt 20 outs "Both conditions are true!" endi
```

### 3.2 — REPS / REPE — Counted Loops

`reps` repeats a block of code a fixed number of times:

```caos
setv va00 0 reps 5 addv va00 1 repe outv va00
```

Output:

```
5
```

The variable `va00` is incremented 5 times, ending at 5.

### 3.3 — LOOP / UNTL — Conditional Loops

`loop`...`untl` repeats until a condition is met:

```caos
setv va00 1 loop mulv va00 2 untl va00 ge 100 outv va00
```

Output:

```
128
```

This doubles `va00` until it reaches or exceeds 100. The first value ≥ 100 is 128 (1 → 2 → 4 → 8 → 16 → 32 → 64 → 128).

> **Console limitation:** You cannot use `loop`...`ever` (infinite loops) or `wait` commands in the Console, because the Console runs each command to completion in a single tick. Use the CAOS IDE for scripts that need timers and waiting.

---

## Part 4: Switching to the CAOS IDE

The Console is great for quick commands, but for anything beyond a single line, the **CAOS IDE** is far more powerful.

### 4.1 — Opening the CAOS IDE

1. Click the **CAOS IDE** tab in the left sidebar.
2. You'll see three panels:
   - **Left:** The Scriptorium Browser (installed scripts)
   - **Centre:** The code editor with a classifier header
   - **Bottom:** The output console

![CAOS IDE Tab](/docs/media/tab_ide.png)

### 4.2 — Writing Multi-Line Code

Click in the code editor and type (or paste) the following:

```caos
* My first multi-line CAOS script
* Lines starting with * are comments

setv va00 0
reps 10
    addv va00 1
    outs "Count: "
    outv va00
    outs " "
repe

outs "Done! Final count: "
outv va00
```

Notice how the IDE:
- **Syntax-highlights** your code (keywords in colour, strings in green, comments dimmed)
- Shows **line numbers** in the left gutter

### 4.3 — Running Your Script

Press **Ctrl+Enter** (or **⌘+Enter** on Mac), or click the **▶ Run** button in the toolbar.

The output appears in the bottom console panel as a continuous stream:

```
Count: 1 Count: 2 Count: 3 Count: 4 Count: 5 Count: 6 Count: 7 Count: 8 Count: 9 Count: 10 Done! Final count: 10
```

> **Note:** The Console output is a single text stream — all `outs` and `outv` calls append to the same line. There are no automatic line breaks between outputs.

![CAOS IDE Editor](/docs/media/editor_multiline.png)

### 4.4 — Auto-Complete

The IDE has built-in auto-complete for all CAOS commands.

1. Clear the editor and start typing `out`
2. Press **Ctrl+Space** (or just keep typing — suggestions appear after 3 characters)
3. A dropdown appears showing `outs`, `outv`, `outx`
4. Use **↑/↓** to navigate, **Enter** or **Tab** to accept

![CAOS IDE Auto-Complete](/docs/media/editor_autocomplete.png)

### 4.5 — Command Help (F1)

Place your cursor on any CAOS keyword and press **F1**. A floating popup appears with the command's full documentation — syntax, parameter types, and description.

### 4.6 — Live Syntax Validation

The IDE validates your code as you type. If there's an error, a red bar appears below the header.

Try typing this intentionally broken code:

```caos
setv va00 "hello"
```

After a brief pause (~1500ms), a red error bar appears:

```
Error: Expected numeric rvalue at token 'hello' (line 1)
```

This is because `setv` expects a number, not a string (you'd need `sets` for strings). The gutter also highlights the offending line in red.

![CAOS IDE Validation Error](/docs/media/editor_validation.png)

---

## Part 5: Agents — The Building Blocks

Everything in the Creatures world is an **agent** — plants, machines, food, toys, and even creatures themselves. Each agent has a **classifier** that identifies it: `(family, genus, species)`.

### 5.1 — Creating a Simple Agent

In the CAOS IDE, type and run:

```caos
* Create a simple invisible agent
new: simp 2 100 300 "blnk" 1 0 9000

* Move it to a visible position in the world
mvto 1000 8900

* Give it attributes: Physics + Wallbound + Activateable + Mouseable
attr 199

outs "Agent created! ID: "
outv unid
```

Let's break this down:

| Part | Meaning |
|---|---|
| `new: simp` | Create a new **simple** agent |
| `2 100 300` | Classifier: family=2, genus=100, species=300 |
| `"blnk"` | Sprite file name (a blank/invisible sprite) |
| `1 0 9000` | 1 image, starting at frame 0, drawing plane 9000 |
| `mvto 1000 8900` | Move to coordinates (1000, 8900) |
| `attr 199` | Set attribute flags (see [Agents Reference](caos_agents.md)) |
| `unid` | The new agent's unique ID |

> **What is `TARG`?** After `new: simp`, the newly created agent automatically becomes `TARG` — the "target" that subsequent commands act on. Most CAOS commands operate on `TARG`.

### 5.2 — Querying Agent Properties

Once created, you can query the agent. Run each of these:

```caos
* Target the agent we just created
rtar 2 100 300

* Print its position
outs "Position: ("
outv posx
outs ", "
outv posy
outs ")\n"

* Print its classifier
outs "Classifier: "
outv fmly
outs " "
outv gnus
outs " "
outv spcs
```

`rtar` sets `TARG` to a random agent matching the classifier. Since we only created one `2 100 300` agent, it targets ours.

### 5.3 — Enumerating Agents

`enum` loops through all agents matching a classifier:

```caos
* Count all creature agents (family 4)
setv va00 0
inst
enum 4 0 0
    addv va00 1
next

outs "Creatures in world: "
outv va00
```

The `enum`/`next` block sets `TARG` to each matching agent in turn. Using `0` as a wildcard (genus=0, species=0) means "any creature".

> **Why `inst`?** The `inst` command puts the VM into "instant" mode — the enumeration runs in a single tick without yielding. Without it, the Console would error because enumeration normally yields between iterations.

### 5.4 — Cleaning Up

Always clean up test agents when you're done:

```caos
* Delete all agents with classifier 2 100 300
inst
enum 2 100 300
    kill targ
next

outs "Cleaned up!"
```

`kill targ` destroys the currently targeted agent.

---

## Part 6: The Scriptorium — Event Scripts

So far, every script we've written runs once and finishes. But the real power of CAOS comes from **event scripts** — scripts stored in the **Scriptorium** that run automatically when things happen in the game.

### 6.1 — Understanding Event Scripts

An event script is identified by four numbers: **Family, Genus, Species, Event**. Common events:

| Event | Name | When it fires |
|---|---|---|
| 1 | Push | Creature pushes the agent |
| 2 | Pull | Creature pulls the agent |
| 3 | Hit | Creature hits the agent |
| 4 | Activate 1 | Primary activation (player click) |
| 5 | Activate 2 | Secondary activation |
| 9 | Timer | Fires every N ticks (set by `tick`) |
| 10 | Constructor | Called once when agent is created |
| 12 | Eat | Creature eats the agent |

### 6.2 — Browsing the Scriptorium

Look at the **left sidebar** in the CAOS IDE — this is the **Scriptorium Browser**. It lists every event script currently loaded in the engine.

1. Scroll through the list — you'll see groups like `2 3 16` ("Seeds"), `1 1 152` ("Teleporter"), etc.
2. Click the **search box** at the top and type `teleporter`
3. The list filters to show only Teleporter scripts

Click any script entry to load its source code into the editor. This is a great way to study how the game's own scripts work!

![CAOS IDE Scriptorium](/docs/media/editor_scriptorium.png)

### 6.3 — Run vs. Inject: What's the Difference?

You've noticed two buttons in the IDE toolbar: **▶ Run** and **Inject**. They do fundamentally different things:

**▶ Run** executes your code **right now, once, and it's done.** Think of it as typing a command into a terminal — the engine processes it immediately and throws away the script. This is what you've been doing in Parts 1–5: creating agents, printing text, running loops.

**Inject** does something entirely different. It **stores your code in the Scriptorium** — the engine's permanent script registry — filed under the classifier you specify (Family / Genus / Species / Event). The code doesn't execute immediately. Instead, it sits there waiting until the right event happens to the right kind of agent.

Here's the key mental model:

| | **▶ Run** | **Inject** |
|---|---|---|
| **When does it execute?** | Immediately, right now | Later, when the event fires |
| **How many times?** | Once | Every time the event occurs |
| **Who is OWNR?** | Nobody (no owner) | The specific agent that received the event |
| **Where does it go?** | Nowhere — it's gone after execution | Stored in the Scriptorium |
| **Use it for…** | Creating agents, one-off commands, testing | Behaviours, reactions, timer loops |

Think of it this way: **Run** is how you *set up the world* (create agents, move things). **Inject** is how you *give agents behaviours* (what they do when clicked, when their timer fires, when a creature pushes them).

That's why the two-step workflow in the next section makes sense: you **Run** an install script to create the agent, then **Inject** a timer script to give it ongoing behaviour.

### 6.4 — Writing Your First Event Script

Let's create a complete agent with a timer script. This involves two steps:

**Step 1 — The Install Script (creates the agent):**

Type this in the IDE editor and click **▶ Run**:

```caos
* === Install Script ===
* Create a counter agent with classifier 2 100 400

new: simp 2 100 400 "blnk" 1 0 500
mvto 1000 8900
attr 195

* Store a counter value in the agent's own variable
setv ov00 0

* Start the timer — fire event 9 every 50 ticks (~2.5 seconds)
tick 50

outs "Counter agent created! ID: "
outv unid
```

**Step 2 — The Timer Script (runs repeatedly):**

Now we need to tell the engine *what to do* when the timer fires. Clear the editor and type:

```caos
* Timer script for classifier 2 100 400
* This runs every 50 ticks

addv ov00 1
```

Before injecting, we need to set the **classifier header** at the top of the editor:

1. Set the four classifier fields to: **Family:** `2`, **Genus:** `100`, **Species:** `400`, **Event:** `9`
2. Click the **Inject** button

![CAOS IDE Inject](/docs/media/editor_inject.png)

You should see a success message in the output: `Injecting as 2 100 400 9…`.

### 6.5 — Verifying Your Script

Switch to the **Scripts** tab to see your timer script running live:

Now go back to the **Console** tab and check the counter:

```caos
rtar 2 100 400 outv ov00
```

Run this a few times — you should see the number increasing!

### 6.6 — Cleaning Up

```caos
* Remove the timer script from the scriptorium
scrx 2 100 400 9

* Delete the agent
inst
enum 2 100 400
    kill targ
next

outs "Cleaned up!"
```

`scrx` removes a script from the Scriptorium. Always clean up both the agent and its scripts when experimenting.

---

## Part 7: The Debugger

The Developer Tools include a full **source-level debugger** for CAOS scripts. Let's see it in action.

### 7.1 — Creating a Script to Debug

In the **CAOS IDE**, create and run this install script:

```caos
* Create a debug target agent
new: simp 2 100 500 "blnk" 1 0 500
mvto 1000 8900
setv ov00 0
tick 20

outs "Debug target created! ID: "
outv unid
```

Now inject its timer script. Set the classifier to **2 / 100 / 500 / 9** and type:

```caos
* Timer script — increments ov00 and checks thresholds
addv ov00 1

doif ov00 gt 100
    setv ov00 0
endi
```

Click **Inject**.

### 7.2 — Setting a Breakpoint in the IDE

1. In the CAOS IDE, with the timer script still loaded, **click line 2** (the `addv ov00 1` line) in the gutter (where the line numbers are)
2. A **red dot** appears — this is your breakpoint
3. The **Breakpoint Panel** opens below the classifier header

![CAOS IDE Breakpoint](/docs/media/editor_breakpoint.png)

### 7.3 — Binding the Breakpoint to an Agent

In the Breakpoint Panel, you'll see agent tags for any agents currently running this script:

1. Click the **agent tag** — it turns **orange**, meaning the breakpoint is now active on that agent
2. The agent's CAOS VM will pause when it hits the breakpoint

![CAOS IDE Breakpoint 2](/docs/media/editor_breakpoint_2.png)

### 7.4 — Inspecting in the Debugger

1. Switch to the **Debugger** tab
2. Find your agent in the left panel (look for classifier `2 100 500`, event `9`)
3. Click it — the source code appears in the centre, with the current execution line **highlighted in orange**

![CAOS Debugger](/docs/media/debugger_breakpoint_active.png)

### 7.5 — Stepping Through Code

Use the toolbar buttons:

| Button | Action |
|---|---|
| **Continue** | Resume execution until the next breakpoint |
| **Step** | Execute one instruction and pause again |
| **Step Over** | Step but skip over nested blocks |

Click **Step** a few times — watch the orange highlight move through the code. In the **Inspector Panel** on the right, you can see:

- **OV Variables** — the agent's persistent variables (watch `ov00` change!)
- **VA Variables** — local variables
- **Context** — OWNR, TARG, IP (instruction pointer)

![CAOS Debugger](/docs/media/debugger_breakpoint_inspect.png)

### 7.6 — Cleaning Up

Click **Continue** in the Debugger to let the script resume. Then go to the Console:

```caos
scrx 2 100 500 9
inst
enum 2 100 500
    kill targ
next
outs "Cleaned up!"
```

---

## Part 8: Working with Creatures

Creatures (Norns, Grendels, Ettins) are special agents with family `4`. They have brains, biochemistry, and drives.

### 8.1 — Inspecting Creatures

```caos
* List all creature positions
inst
enum 4 0 0
    outs "Creature at ("
    outv posx
    outs ", "
    outv posy
    outs ") — Health: "
    setv va00 100
    subv va00 dead
    outv va00
    outs "%\n"
next
```

> **Tip:** For rich creature inspection, use the **Creatures** tab instead — it shows live drive bars, biochemistry, brain activity, and more. CAOS is better for batch operations and automation.

### 8.2 — Interacting with Creature Chemistry

You can inject chemicals into creatures using the `chem` command:

```caos
* Target a random norn (family 4, genus 1)
rtar 4 1 0

* Check current hunger level
outs "Hunger for protein: "
outv driv 1
```

The `driv` command reads a creature's drive level as a float. The drive indices are:

| Index | Drive |
|---|---|
| 0 | Pain |
| 1 | Hunger (Protein) |
| 2 | Hunger (Carbohydrate) |
| 3 | Hunger (Fat) |
| 4 | Coldness |
| 5 | Hotness |
| 6 | Tiredness |
| 7 | Sleepiness |

See the [Creatures Reference](caos_creatures.md) for the full list.

### 8.3 — Moving the Camera

Want to look at a creature? You can move the camera:

```caos
* Target a random creature
rtar 4 0 0

* Move the camera to centre on it
cmrp posx posy 0
```

`cmrp` moves the camera to a position with smooth scrolling. The third parameter (`0`) is a flag — `0` for the main camera.

> **Tip:** The **Focus** button in the Creatures tab does exactly this with one click!

---

## Part 9: Putting It All Together

Let's build a complete agent from scratch — a **"Population Monitor"** that counts creatures every few seconds.

### 9.1 — The Install Script

Run this in the CAOS IDE:

```caos
* === Population Monitor ===
* Creates an invisible agent that periodically counts creatures

new: simp 2 100 600 "blnk" 1 0 500
mvto 1000 8900

* ov00 = total count of checks performed
* ov01 = last creature count
setv ov00 0
setv ov01 0

* Fire timer every 100 ticks (~5 seconds)
tick 100

outs "Population Monitor active! ID: "
outv unid
```

### 9.2 — The Timer Script

Set the classifier to **2 / 100 / 600 / 9** and inject:

```caos
* Count all creatures
setv va00 0
inst
enum 4 0 0
    addv va00 1
next

* Increment check counter
addv ov00 1

* Store the latest count
setv ov01 va00
```

### 9.3 — Checking the Monitor

Now, in the Console, you can query the monitor at any time:

```caos
rtar 2 100 600
outs "Check #" outv ov00 outs ": " outv ov01 outs " creatures\n"
```

Run this a few times over the next minute — `ov00` increments (the number of checks), and `ov01` shows the creature count at each check.

### 9.4 — Tear Down

```caos
scrx 2 100 600 9
inst
enum 2 100 600
    kill targ
next
outs "Monitor removed."
```

---

## Part 10: Saving Your Work

### 10.1 — Saving Scripts as .cos Files

In the CAOS IDE, click the **Save .cos** button to download your script as a `.cos` file. This is the standard file format for CAOS scripts.

### 10.2 — Loading Scripts

Click **Load .cos** to open a file picker and load a `.cos`, `.txt`, or `.caos` file into the editor.

### 10.3 — The scrp / endm Wrapper

When you browse Scriptorium scripts, you'll notice they don't have `scrp` / `endm` wrappers — those are added automatically when reading from the scriptorium. But in `.cos` files, scripts are wrapped:

```caos
scrp 2 100 400 9
    addv ov00 1
endm
```

The `scrp` line declares the classifier, and `endm` marks the end. When you **Inject** from the IDE, the wrapper is stripped automatically — you only need the body.

> **Tip:** A `.cos` file can contain multiple scripts and install code. The install script (code outside any `scrp`/`endm` block) runs immediately when injected. Event scripts inside `scrp`/`endm` are installed in the Scriptorium.

---

## Quick Reference Card

| Task | CAOS |
|---|---|
| Print text | `outs "text"` |
| Print number | `outv 42` |
| Set number variable | `setv va00 42` |
| Set string variable | `sets va00 "hello"` |
| Random number | `setv va00 rand 1 100` |
| Conditional | `doif va00 gt 5 ... elif ... else ... endi` |
| Counted loop | `reps 10 ... repe` |
| Until loop | `loop ... untl va00 ge 100` |
| Create agent | `new: simp f g s "sprite" cnt first plane` |
| Move agent | `mvto x y` |
| Kill agent | `kill targ` |
| Count agents | `outv totl family genus species` |
| Enumerate agents | `inst enum f g s ... next` |
| Set timer | `tick rate` |
| Set attributes | `attr flags` |
| Agent's unique ID | `outv unid` |
| Target by ID | `targ agnt id` |
| Target random | `rtar family genus species` |
| Remove script | `scrx family genus species event` |
| World name | `outs wnam` |
| Move camera | `cmrp x y camera` |

---

## Where to Go Next

- **[CAOS Command Reference](caos_overview.md)** — The complete glossary of every CAOS command, organized by category
- **[Console Tab](tab_console.md)** — Detailed documentation on the Console's features and limitations
- **[CAOS IDE Tab](tab_caos_ide.md)** — Full reference for the IDE's editing, auto-complete, and breakpoint features
- **[Debugger Tab](tab_debugger.md)** — In-depth guide to the source-level debugger
- **[Creatures Tab](tab_creatures.md)** — Live creature inspector with drives, chemistry, and brain visualization
- **[Genetics Kit Tab](tab_genetics_kit.md)** — Create, cross-breed, and inject creatures using the genome editor

---

*This tutorial was written for the Creatures 3 / Docking Station Developer Tools. All examples have been tested against a live engine instance.*
