# Voronoi Skies: Island Defense Campaign

**Version:** 1.0  
**Purpose:** Define the campaign structure, strategic layer, and gameplay loop for defending (or invading) an island through air power.

---

## 1. Campaign Premise

The player commands air assets in a dynamic campaign centered on an island. The default scenario: defend against amphibious invasion. Alternative scenarios reverse roles or modify objectives.

### 1.1 Core Fantasy

You are the air commander for a small island nation. Enemy naval forces approach. Your fighters, limited fuel, and handful of airbases are all that stand between invasion and sovereignty. Every sortie matters. Attrition is permanent.

### 1.2 Scenario Variants

| Scenario | Player Role | Objective |
|----------|-------------|-----------|
| **Homeland Defense** | Defender | Prevent enemy from capturing airfields |
| **Liberation** | Attacker | Support amphibious assault, capture island |
| **Interdiction** | Defender | Stop enemy resupply convoys |
| **Evacuation** | Defender | Buy time for civilian evacuation |

---

## 2. Strategic Layer

### 2.1 Strategic Map

The island graph doubles as the strategic map. Each region has:

| Property | Description |
|----------|-------------|
| `controller` | friendly / enemy / contested / neutral |
| `installation` | airbase / port / radar / sam / depot / none |
| `groundForces` | troop strength (for land combat resolution) |
| `supplyLevel` | logistics status |

### 2.2 Installations

**Airbases**
- Required to operate aircraft
- Runway condition affects sortie rate
- Can be damaged, repaired, captured
- Placement: flat, low-elevation regions

**Ports**
- Naval resupply and reinforcement
- Enemy invasion landing points
- Player evacuation/resupply
- Placement: coastal regions

**Radar Sites**
- Extend detection range
- Early warning of incoming strikes
- Placement: high-elevation regions

**SAM Sites**
- Area denial
- Threaten enemy aircraft
- Placement: strategic chokepoints

**Supply Depots**
- Fuel and ammunition storage
- Destruction degrades sortie rate
- Placement: interior regions

### 2.3 Naval Forces

Enemy (and potentially friendly) naval task forces operate offshore:

| Unit | Role |
|------|------|
| **Carrier** | Launches enemy aircraft, high-value target |
| **Amphibious Assault Ship** | Delivers invasion force |
| **Destroyer** | Escorts, SAM coverage, naval gunfire |
| **Submarine** | Interdiction, hard to detect |
| **Supply Ship** | Resupply, soft target |

Naval units:
- Move along predefined approach routes
- Can be detected by coastal radar, maritime patrol
- Can be attacked by player aircraft (anti-ship missions)
- Carriers generate enemy sorties

### 2.4 Time and Turns

Campaign time advances in **days**. Each day:

```
Dawn
├── Intelligence briefing (enemy positions, detected threats)
├── Player plans sorties for the day
└── Weather forecast

Day Phase (player flies sorties)
├── Multiple sorties possible (limited by aircraft, pilots, fuel)
├── Each sortie is a real-time mission
├── AI resolves concurrent friendly/enemy actions
└── Losses are permanent

Dusk
├── Sortie results tallied
├── Ground combat resolution (if forces in contact)
├── Enemy strategic moves
└── Resupply and repair

Night
├── Limited operations (night-capable aircraft only)
├── Special missions (recon, interdiction)
└── Advance to next day
```

### 2.5 Strategic AI

Enemy follows doctrine-driven behavior:

**Invasion Doctrine**
1. Achieve air superiority (attrit player aircraft)
2. Suppress air defenses (SEAD strikes on SAM/radar)
3. Establish beachhead (amphibious landing)
4. Expand and capture airbases
5. Mop up resistance

**Defensive Priorities**
- Protect carriers (CAP, escort)
- Screen landing force
- Strike player airbases

Enemy adapts based on:
- Player attrition (exploit weakness)
- Weather windows
- Supply status

---

## 3. Air Operations

### 3.1 Mission Types

| Mission | Objective |
|---------|-----------|
| **CAP** (Combat Air Patrol) | Defend airspace, intercept inbound |
| **Escort** | Protect strike package |
| **Strike** | Attack ground installation |
| **Anti-Ship** | Attack naval targets |
| **SEAD** | Suppress enemy air defenses |
| **Recon** | Gather intelligence |
| **Intercept** | Scramble against detected threat |

### 3.2 Sortie Planning

Before each sortie, player selects:

- **Mission type**
- **Aircraft** (from available inventory)
- **Loadout** (weapons, fuel tanks)
- **Pilot** (affects skill modifiers)
- **Target/Patrol area**
- **Timing** (immediate, scheduled)

Constraints:
- Aircraft availability (damage, maintenance)
- Pilot fatigue
- Fuel and weapons inventory
- Runway status

### 3.3 Sortie Execution

Each sortie is a real-time gameplay session:

1. **Takeoff** from assigned airbase
2. **Transit** to target area
3. **Engage** (combat, reconnaissance, strike)
4. **Egress** and return
5. **Landing** (or divert, eject, crash)

Mission success/failure affects:
- Strategic situation (target destroyed, enemy attrited)
- Pilot experience
- Aircraft status
- Player resources

### 3.4 AI Wingmen

Player may lead a flight of 2–4 aircraft:

- Wingmen follow formation commands
- Basic autonomous combat (engage if fired upon)
- Can be given attack/defend directives
- Subject to same attrition as player

### 3.5 Concurrent Operations

While player flies one sortie, other operations continue:

- AI-controlled friendly sorties (with abstracted resolution)
- Enemy strikes against player installations
- Naval movement
- Ground combat

Player choices about force allocation matter—fly every mission yourself, or trust AI with some?

---

## 4. Resources and Attrition

### 4.1 Aircraft Inventory

Limited aircraft, no magical replacement:

| Status | Description |
|--------|-------------|
| Ready | Available for sortie |
| Damaged | Requires repair time |
| Destroyed | Permanently lost |
| Maintenance | Scheduled downtime |

Aircraft types (initially):
- **F-16C** (player's primary, multi-role)
- **MiG-29** (enemy primary)
- Expansion: F-15, Su-27, A-10, maritime patrol

### 4.2 Pilot Roster

Named pilots with:

| Attribute | Effect |
|-----------|--------|
| Experience | Skill modifiers, unlock abilities |
| Fatigue | Limits consecutive sorties |
| Kills | Ace status, morale |
| Status | Active / wounded / KIA / POW |

Losing experienced pilots hurts. New replacement pilots are green.

### 4.3 Supplies

| Resource | Depleted By | Replenished By |
|----------|-------------|----------------|
| Fuel | Sorties | Depot, resupply ship |
| Missiles | Combat | Depot, resupply ship |
| Bombs | Strike missions | Depot, resupply ship |
| Spare parts | Repairs | Depot, resupply ship |

If supplies run low:
- Fewer sorties possible
- Loadouts restricted
- Damaged aircraft stay damaged

### 4.4 Attrition Model

Combat losses are permanent within a campaign:

- Aircraft shot down → destroyed or pilot ejects
- Pilot ejects over friendly territory → recovered (wounded or OK)
- Pilot ejects over enemy territory → POW
- Pilot ejects over ocean → rescue mission possible

Heavy attrition without resupply leads to defeat.

---

## 5. Victory and Defeat

### 5.1 Defender Victory Conditions

| Condition | Description |
|-----------|-------------|
| **Repel Invasion** | Enemy withdraws after heavy losses |
| **Survive** | Hold at least one airbase for X days until reinforcement |
| **Negotiate** | Enemy accepts ceasefire (triggered by attrition threshold) |

### 5.2 Defender Defeat Conditions

| Condition | Description |
|-----------|-------------|
| **Airfields Lost** | All airbases captured or destroyed |
| **Attrition** | No operational aircraft remaining |
| **Surrender** | Player concedes |

### 5.3 Attacker Victory/Defeat (Liberation Scenario)

Reversed—player must capture airbases, defender AI tries to hold.

---

## 6. Campaign Setup Flow

### 6.1 New Campaign

```
Main Menu
└── New Campaign
    ├── Select Scenario
    │   ├── Homeland Defense
    │   ├── Liberation  
    │   └── Custom
    ├── Select Island Template
    │   ├── Tropical Volcanic
    │   ├── Archipelago
    │   └── Random (seed input)
    ├── Difficulty
    │   ├── Casual (forgiving attrition)
    │   ├── Normal
    │   └── Ironman (permadeath, no reload)
    ├── Preview Island
    │   └── 2D strategic map view
    └── Begin Campaign
```

### 6.2 Campaign Load

```
Main Menu
└── Continue Campaign
    └── [List of saved campaigns with summary]
        ├── Day 5 - 3 airbases, 12 aircraft, enemy approaching
        └── ...
```

### 6.3 Pre-Sortie Screen

```
Strategic Map
├── Current situation overlay
│   ├── Friendly installations (blue)
│   ├── Enemy positions (red, known)
│   ├── Threat rings (SAM coverage)
│   └── Naval contacts
├── Available sorties sidebar
│   ├── Ready aircraft list
│   ├── Pilot roster
│   └── Supply status
├── Plan Mission button
│   └── Mission planning dialog
└── Advance Time button
    └── Skip to next phase (if no sortie desired)
```

---

## 7. Interface Requirements

### 7.1 Strategic Map View

2D top-down view of island graph:

- Regions colored by controller (friendly/enemy/neutral)
- Icons for installations
- Movement arrows for detected naval forces
- Threat rings for SAM coverage
- Flight paths for planned sorties

### 7.2 Mission Planning Dialog

| Element | Function |
|---------|----------|
| Mission type dropdown | CAP, Strike, Anti-Ship, etc. |
| Aircraft selector | Available airframes with status |
| Loadout configurator | Weapons/tanks/pods |
| Pilot selector | Available pilots with stats |
| Target selector | Click on map or select from list |
| Threat assessment | Auto-generated based on known enemy |
| Commit button | Launch sortie |

### 7.3 Debrief Screen

After each sortie:

- Mission result (success/partial/failure)
- Kills and losses
- Pilot status updates
- Strategic impact summary
- Experience gained

### 7.4 Campaign Summary

Accessible anytime:

- Day count
- Score/rating
- Aircraft inventory
- Pilot roster
- Territory control percentage
- Supply levels

---

## 8. Progression Systems

### 8.1 Pilot Progression

| Level | Title | Unlocks |
|-------|-------|---------|
| 0 | Nugget | Basic flight |
| 5 | Pilot | Improved gunnery |
| 15 | Veteran | Tactical awareness (radar boost) |
| 30 | Ace | Signature ability |

### 8.2 Meta-Progression (Across Campaigns)

Optional unlocks for completing campaigns:

- Additional aircraft types
- Ace pilot portraits
- Historical scenarios
- Challenge modifiers

### 8.3 Difficulty Modifiers

| Modifier | Effect |
|----------|--------|
| Ironman | No save-scumming |
| Limited Intel | Enemy positions less visible |
| Fuel Crisis | Reduced fuel supplies |
| Ace Combat | Enemy pilots more skilled |
| Bad Weather | More weather disruptions |

---

## 9. Future Expansion Hooks

### 9.1 Multiplayer

- Cooperative: Two players share aircraft pool
- Adversarial: One player commands each side

### 9.2 Additional Theaters

- Different island templates (arctic, desert)
- Land-based campaigns (defend airbase network)
- Carrier operations (player operates from carrier)

### 9.3 Additional Aircraft

- Support aircraft (AWACS, tanker, maritime patrol)
- Helicopters (rescue, attack)
- Bombers (heavy strike)

### 9.4 Ground War Integration

- More detailed ground combat model
- Close air support missions
- Forward air controller gameplay

---

## 10. Implementation Phases

### Phase 1: Campaign Infrastructure

- Campaign state management
- Save/load system
- Strategic map rendering (2D)
- Day/phase progression

### Phase 2: Mission Planning

- Sortie planning UI
- Aircraft and pilot selection
- Loadout configuration
- Mission briefing generation

### Phase 3: Strategic AI

- Enemy movement logic
- Strike planning
- Invasion progression
- Difficulty scaling

### Phase 4: Attrition and Resources

- Damage and repair system
- Supply tracking
- Pilot fatigue and recovery
- Resupply mechanics

### Phase 5: Victory Conditions

- Win/lose state detection
- Campaign scoring
- End-game summary
- Meta-progression hooks

---

*Specification version 1.0*  
*Voronoi Skies Island Defense Campaign*  
*Every sortie matters*