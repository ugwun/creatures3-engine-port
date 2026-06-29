# EXPERIMENTAL SPECIFICATION & PROTOCOL: BRIDGING THE "LIMBIC GAP" VIA THERMODYNAMIC ACTIVE INFERENCE IN CREATURES 3

## 1. EXECUTIVE SUMMARY & OBJECTIVE
Modern Large Language Models (LLMs) and artificial agents lack an underlying physiological and emotional homeostatic modulation system [1]. This "limbic gap" prevents them from continuously learning in real-time and generalizes poorly to out-of-distribution environments, leading to massive, energy-inefficient compute scaling [1]. 

This protocol specifies an experiment to ground the **Limbic System** and **Social Networks** of artificial agents (*Norns* in *Creatures 3*) within Karl Friston's **Free Energy Principle (FEP)** [6, 7]. Under FEP, self-organizing biological systems minimize their variational free energy to resist entropy and maintain homeostasis [5, 8, 9]. By imposing metabolic energy costs on internal brain functions (synaptic firing, reinforcement, and migration) [2, 148, 149] and collective actions (speech production) [4, 132], we test whether an artificial population can converge to a stable, energy-efficient collective homeostasis. This document serves as a complete technical instruction set for an AI agent with access to the *Creatures 3* engine codebase and CAOS (Creatures Agent Object Script) interface.

---

## 2. THEORETICAL FOUNDATION: METABOLIZED ACTIVE INFERENCE
Under Friston's formulation, variational free energy ($F$) is bounded as:
$$F = \text{Complexity} - \text{Accuracy}$$
*   **Complexity (Bayesian Surprise)** represents the Kullback-Leibler (KL) divergence between the agent's posterior beliefs ($q$) and its prior expectations ($p$) [21, 26, 39]:
    $$\text{Complexity} = D_{KL}(q(\vartheta | \mu) \parallel p(\vartheta))$$
*   **Accuracy** is the expected log-likelihood of sensory inputs ($\tilde{s}$) given those causes [14, 26]:
    $$\text{Accuracy} = \langle \ln p(\tilde{s} | \vartheta) \rangle_q$$

### The Thermodynamic Grounding of Complexity
In mathematical formulations, complexity is a penalty that prevents over-fitting [39]. In biological brains, however, this penalty is physical: **making, updating, and firing neural connections is metabolically expensive** [38, 60]. This experiment replaces the abstract information-theoretic complexity penalty with a **metabolic energy toll** in the *Creatures 3* environment.
1.  **Perception**: The agent updates its recognition density ($q$) to approximate the true conditional density ($p(\vartheta | \tilde{s})$) [15, 27]. This optimization is biologically realized via Hebbian plasticity, which is mathematically equivalent to a gradient descent on free energy [46].
2.  **Active Inference**: The agent acts on Albia (using actions like *Pushing* or *Pulling*) to sample sensory data that conform to its prior homeostatic expectations, thereby maximizing accuracy and minimizing prediction errors [14, 16, 26].
3.  **Social Active Inference**: Agents engage in communication (the *Think / Say* action) to align their internal world models [4, 132]. This reduces population-level prediction errors, but at a distinct metabolic cost [4].

---

## 3. CREATURES 3 ARCHITECTURAL MECHANICS & CONSTRAINTS

To implement this specification, the AI agent must operate under the strict structural constraints of the *Creatures 3* engine [1, 2]:

### 3.1. Brain Architecture (The Lobe Network)
A Norn's brain consists of **952 neurons** and is constrained to approximately **5,000 active connections** [130, 148]. These connections are sparse to operate under 1996-era computational constraints [2, 147]. The brain is segmented into 9 functionally distinct lobes [130]:
*   **Stimulus Source Lobe** (40 neurons): Fires when objects in Albia are seen or heard [134]. It operates on a "Winner-Takes-All" (WTA) selection policy [135].
*   **Noun Lobe** (40 neurons): Activates when the player or another agent types or says an object's name [135]. Also WTA [135].
*   **Attention Lobe** (40 neurons): Integrates inputs from the Stimulus Source and Noun lobes to determine the current object of focus [136, 141].
*   **Drive Lobe** (16 neurons, 13 active): Represents the interoceptive physiological state of the agent [139]. Key homeostatic variables include:
    *   `Drive 0`: Pain
    *   `Drive 1`: Need for Pleasure (Boredom)
    *   `Drive 2`: Hunger
    *   `Drive 3`: Coldness
    *   `Drive 4`: Hotness
    *   `Drive 5`: Tiredness
    *   `Drive 6`: Sleepiness
    *   `Drive 7`: Loneliness
    *   `Drive 8`: Overcrowdedness
    *   `Drive 9`: Fear
    *   `Drive 10`: Boredom
    *   `Drive 11`: Anger
    *   `Drive 12`: Sexdrive
*   **General Sense Lobe** (32 neurons): Represents physical events (being patted, slapped, colliding with walls) and social properties of targeted objects (kinship, species matching) [139, 140].
*   **Verb Lobe** (40 neurons): Activates when a language verb is parsed [141].
*   **Perception Lobe**: A composite buffer that copies the states of the Drive, Verb, General Sense, and Attention lobes, overcoming the engine's constraint that a lobe can only connect to two other lobes [138].
*   **Concept Lobe** (256 neurons): Represents "situations" or environmental states [137, 138]. Each neuron receives 1 to 3 connections from the Perception Lobe [137]. Genetic constraints specify that a Concept neuron can connect to at most **one drive** and **one verb** to prevent impossible situational permutations [143]. Its activation rule is `anded 0:`, meaning a Concept neuron fires only if all of its inputs are active [155].
*   **Decision Lobe** (16 neurons, 12 active actions): Selects the final behavior [130, 131]. Each Action neuron receives 256 connections from the Concept Lobe (128 positive/reinforcing $D_0$ dendrites, 128 negative/inhibiting $D_1$ dendrites) [137, 156]. Its State-Variable (SV) Rule is:
    $$\text{State} = \text{State}_{t-1} + \sum \text{Inputs}(D_0) - \sum \text{Inputs}(D_1)$$
    The action with the highest neuron state value is executed under a Winner-Takes-All policy [131].

### 3.2. Plasticity and Learning
Synaptic dynamics rely on three main mechanisms: **reinforcement, atrophy, and migration** [2, 148].
*   **Reinforcement**: When a homeostatic drive is reduced (e.g., Hunger decreases after eating), positive reinforcement chemicals (such as "Reward") are injected [148, 154].
*   **Atrophy**: Unused or poorly-performing connections decay in strength over time [148].
*   **Migration**: When a connection's strength falls below a minimum threshold, the synapse physically detaches from its post-synaptic neuron and reattaches to another, searching for useful causal associations [149].
*   **Instincts**: Innate genes that inject "Reward" or "Punish" chemicals [150, 154]. Crucially, Hebbian weight adjustments and synaptic consolidation are processed **offline during sleep**, simulating biological synaptic homeostasis [154].

---

## 4. EXPERIMENT PROTOCOL: LAYER 1 (INTERNAL BRAIN METABOLISM)

### 4.1. Implementation Mechanism via CAOS Scripting
The AI agent must inject metabolic feedback into the Norn's bloodstream by executing CAOS scripts that intercept neural events [1, 122].

1.  **Synaptic Firing Cost**: On every engine tick, for every active neuron firing in the *Decision* and *Concept* lobes, CAOS must inject a marginal dose of `Tiredness` (Drive 5/6) or deplete metabolic reserves (`Glycogen` / `Glucose`).
2.  **Synaptic Rewiring Penalty**: Synaptic migration (disconnection and re-allocation) represents structural model complexity [149]. The agent must monitor the neural memory table. When a synapse detaches and migrates:
    *   Execute a CAOS `stim writ` command to inject `Pain` (Drive 0) or `Fatigue` (Drive 5) [122, 139].
    *   *CAOS Command Template for Metabolic Injection*:
        ```plain
        * Inject Pain (ID: 0) and Tiredness (ID: 5) to target Norn
        stim writ norn 10 [PainAmount] 0 0 [TirednessAmount] 0 0 0 0 0 0 0
        ```
        *(Note: actual magic numbers for Norn stims should be mapped to the target biochemistry index in the Creatures 3 engine [122, 123]).*

### 4.2. Hypotheses
*   **Hypothesis 1.1**: Introducing a synaptic wiring metabolic penalty will force Norns to develop a highly sparse network of strong, non-migrating synapses, minimizing model complexity while maintaining homeostatic accuracy [39, 149].
*   **Hypothesis 1.2**: In environments with volatile resource distributions, Norns under metabolic brain constraints will show higher survival rates (longevity) and lower overall biochemical state entropy than unconstrained Norns, which will suffer from chaotic synaptic migration and metabolic exhaustion [2, 149].

### 4.3. Metrics & Mathematical Formulations
*   **Biochemical State Entropy ($H_{bio}$)**:
    $$H_{bio} = -\sum_{i=1}^{13} P(d_i) \log_2 P(d_i)$$
    where $P(d_i)$ is the normalized level of Drive neuron $i$ (e.g., Hunger, Pain, Boredom) [139] over $T = 10,000$ ticks. Lower entropy represents stable homeostatic control [5, 9].
*   **Synaptic Migration Rate ($R_{mig}$)**:
    $$R_{mig} = \frac{\Delta \text{Synapses Migrated}}{\Delta t}$$
    Measures the frequency of synaptic detachment and re-allocation across the 5,000 active connections [148, 149].
*   **Bayesian Complexity Metric ($C$)**:
    $$C = \sum_{j} |w_j(t) - w_j(\text{birth})|$$
    The cumulative drift of synaptic weights $w$ from their genetic instincts [150], representing the informational cost of updating the generative model [26].

---

## 5. EXPERIMENT PROTOCOL: LAYER 2 (SOCIAL METABOLISM & LINGUISTIC ALIGNMENT)

### 5.2. Implementation Mechanism
In the second stage, the agent introduces metabolic constraints to social communication.
1.  **Linguistic Cost**: When a Norn executes `Action 8: Think / Say` [132], CAOS must immediately apply a significant metabolic penalty (depleting glucose, injecting tired chemicals) [139].
2.  **Shared Environment**: Place multiple Norns with heterogeneous drive sensitivities (genetically varied limbic profiles, approximating a social "Big 5" model of trait distribution) in an arena with sparse food and high environmental entropy [3].

### 5.2. Hypotheses
*   **Hypothesis 2.1**: When speaking is metabolically expensive, Norns will suppress randomized babble and only coordinate when the shared prediction error (e.g., locating food) is high enough to offset the communication cost [3, 4].
*   **Hypothesis 2.2**: A socially metabolised network of heterogeneous Norns will converge to a stable, low-entropy population size faster than a homogeneous population, as individual trait variations allow agents to specialize in complementary environmental niches [3].

### 5.3. Metrics & Mathematical Formulations
*   **Population Free Energy ($F_{pop}$)**:
    $$F_{pop} = \sum_{a=1}^{N} F_a$$
    The sum of individual variational free energies across all $N$ living agents in Albia [8, 120].
*   **Linguistic Shannon Efficiency ($E_{lang}$)**:
    $$E_{lang} = \frac{\text{Successful Food/Danger Coordinates Shared}}{\text{Total Words Emitted}}$$
    Tracks the proportion of metabolic energy spent on speech that leads to successful homeostatic coordination [4, 132].
*   **Linguistic Convergence Time ($T_{conv}$)**:
    The number of simulation ticks required for the vocabulary representation in the *Noun* and *Verb* lobes of the population to stabilize within a 90% Jaccard similarity threshold [4, 130].

---

## 6. CONDITIONS, CONSTRAINTS, & FEASIBILITY ANALYSIS FOR THE AI AGENT

The executing AI agent must analyze the following engine limits before establishing the experiment:

| Parameter / Constraint | Value / Limit | Impact on Experimentation |
| :--- | :--- | :--- |
| **Max Connections** | ~5,000 active synapses [130, 148] | Keeps structural complexity small, making synaptic monitoring computationally cheap and feasible. |
| **Lobe Input Limit** | Max 2 input lobes per target lobe [138, 155] | Concept lobe can only receive from Perception (which must wrap Drive, Verb, General Sense, Attention) [138]. You cannot connect other lobes directly to Concept without re-routing through Perception. |
| **Genetic Limitations** | Max 1 drive and 1 verb per Concept neuron [143] | Limits the complexity of "situations" Norns can perceive [137, 138]. The agent cannot design high-dimensional multi-drive situations (e.g., "Hungry AND Cold AND Bored AND Scared") on a single neuron. |
| **Instinct Dosing** | Consolidated offline during Sleep [154] | Synaptic weight adjustments do not occur continuously during awake execution; they occur in sleep phases. Any CAOS-injected rewards must be evaluated over full sleep cycles to measure learning impact [154]. |
| **WTA Mechanics** | Stimulus, Noun, Attention, Decision [131, 135] | The WTA (Winner-Takes-All) design means that small metabolic fluctuations will not cause micro-behavior changes. Behavioral switching only occurs when a competing neuron overcomes the active threshold [131]. |

---

## 7. ANNOTATED BIBLIOGRAPHY & SOURCE REPOSITORY

To maintain grounding and let the AI agent retrieve the source material, use these exact papers and articles in its context window:

1.  **Bio-Inspired Generalization: Applying Creatures Alife to Modern AI** [Markdown Source]
    *   *Key Concepts*: Limbic gap in LLMs; compute frugality; reinforcement, atrophy, and migration; sparse representations; social heterogeneity and trait variation [1, 2, 3].
2.  **Friston - The free-energy principle - a unified brain theory.pdf** [Academic Paper]
    *   *Key Concepts*: Variational free energy, homeostasis, sensory entropy, predictive coding, active inference, complexity vs. accuracy [5, 8, 9, 26, 39].
3.  **The AI of Creatures - Alan Zucconi** [Web Resource]
    *   *Key Concepts*: CAOS scripting command structure; Norn brain lobe layout (9 lobes, 952 neurons, 5,000 connections); WTA mechanisms; genetics, drives, and instincts [116, 121, 122, 130, 131, 148, 150].
4.  **[1706.03741] Deep reinforcement learning from human preferences**
    *   *Key Concepts*: Goals defined via pairwise trajectory feedback; human preference training [166].
5.  **[1706.03762] Attention Is All You Need**
    *   *Key Concepts*: Transformer architecture; sequence transduction; attention mechanisms dispensing with recurrence [174].
6.  **[2510.21860] Butter-Bench: Evaluating LLM Controlled Robots for Practical Intelligence**
    *   *Key Concepts*: Evaluation of embodied reasoning; failure of LLMs in practical, messy environments compared to humans [183].
7.  **[2510.26787] Remote Labor Index: Measuring AI Automation of Remote Work**
    *   *Key Concepts*: Real-world project benchmark for end-to-end agent automation [192].
