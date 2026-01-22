# Voronoi Skies: Control and UI Specification

**Version:** 1.0  
**Purpose:** Complete input and interface design specification for Voronoi Skies, balancing simulation depth with accessible controls.

---

## 1. Design Philosophy

### 1.1 Core Principle: Non-Dominant Hand Flies, Dominant Hand Fights

The left hand (WASD cluster) handles continuous flight controlâ€”throttle, turn, altitude. The right hand (mouse) handles discrete systems interactionâ€”target selection, radar management, menus. This mirrors HOTAS ergonomics without requiring specialized hardware.

### 1.2 Secondary Principle: The Game Viewport is Sacred

All UI elements defer to the 3D view. Panels fade or minimize when idle. No persistent chrome steals screen space. Information appears when needed, disappears when not.

### 1.3 Tertiary Principle: Analog Feel from Digital Input

Keyboard controls simulate analog stick behavior through rate-limited deflection and position hold. Visual indicators provide the feedback that physical controls would otherwise give.

---

## 2. Flight Controls

### 2.1 Virtual Stick (Turn Control)

The virtual stick governs aircraft turn rate. It has position (-1 to +1) that persists until changed.

| Input | Effect |
|-------|--------|
| Hold A | Stick deflects left at constant rate until full deflection (-1) |
| Hold D | Stick deflects right at constant rate until full deflection (+1) |
| Release | Stick holds current position |
| Tap opposite key | Stick moves toward center / opposite direction |
| C key (or A+D simultaneous) | Stick returns to center (wings level) |

**Parameters:**

| Parameter | Value | Notes |
|-----------|-------|-------|
| Deflection rate | 2.5 units/second | 0.4 seconds from center to full |
| Centering behavior | None (hold position) | Explicit centering required |
| Deadzone | Â±0.05 | Below threshold treated as zero |

**Turn rate mapping:** Aircraft turn rate is proportional to stick deflection. At full deflection, aircraft turns at maximum rate (configurable per aircraft type, typically 3Â°/second for jets, higher for props).

### 2.2 Throttle Control

Throttle is a set-and-hold control. Position persists until adjusted.

| Input | Effect |
|-------|--------|
| W | Increase throttle position at constant rate |
| S | Decrease throttle position at constant rate |
| Shift (held) | Engage afterburner (if available, if throttle at military power) |
| Release Shift | Afterburner disengages, throttle returns to military power |

**Throttle Zones:**

| Range | Zone |
|-------|------|
| 0.0 | Idle |
| 0.0â€“1.0 | Normal power range |
| 1.0 | Military power (max non-AB thrust) |
| 1.0â€“1.5 | Afterburner zone (only accessible while holding Shift) |

**Parameters:**

| Parameter | Value | Notes |
|-----------|-------|-------|
| Throttle rate | 0.5 units/second | 2 seconds from idle to military |
| Afterburner engagement rate | 2.0 units/second | Fast spool-up |
| Afterburner decay | Immediate | Returns to 1.0 when Shift released |

### 2.3 Altitude Control

Altitude is commanded directly, not through pitch. The aircraft climbs or descends at a rate determined by the input.

| Input | Effect |
|-------|--------|
| E | Increase altitude (climb) |
| Q | Decrease altitude (descend) |
| Release | Altitude holds (level flight) |

**Parameters:**

| Parameter | Value | Notes |
|-----------|-------|-------|
| Base climb rate | 1000 ft/minute | At military power |
| Descent rate | Up to 2000 ft/minute | Gravity assists |
| Rate modifiers | Throttle, speed | Actual rate varies with flight state |

**Rationale:** Top-down perspective makes pitch attitude meaningless visually. Direct altitude control is more intuitive for this view and simplifies the control scheme.

### 2.4 Control Summary Table

| Key | Function | Behavior |
|-----|----------|----------|
| A | Turn left | Deflect stick left while held |
| D | Turn right | Deflect stick right while held |
| C | Center stick | Return stick to neutral |
| W | Throttle up | Increase while held |
| S | Throttle down | Decrease while held |
| Shift | Afterburner | Engage while held (requires throttle at military) |
| E | Climb | Increase altitude while held |
| Q | Descend | Decrease altitude while held |

---

## 3. Systems Controls (Mouse)

### 3.1 Cursor Modes

The mouse cursor operates in context-sensitive modes:

| Mode | Cursor | Activation |
|------|--------|------------|
| Default | Arrow | Normal state |
| Radar slew | Crosshair | Radar in search mode |
| Menu | Arrow | Radial menu or dialog open |

**Default mode behaviors:**
- Hovering over Voronoi cells highlights them
- Hovering near player aircraft reveals radial menu anchor

**Radar slew mode behaviors:**
- Mouse position maps to radar azimuth/elevation within scan volume

### 3.2 Click Actions

| Input | Context | Action |
|-------|---------|--------|
| Left-click | On Voronoi cell | Select target for STT lock |
| Left-click | On radar contact | Lock target |
| Left-click | On menu item | Activate menu item |
| Right-click | Anywhere | Open context radial menu |
| Middle-click | On locked target | Unlock target |

### 3.3 Scroll Wheel

| Input | Context | Action |
|-------|---------|--------|
| Scroll up | Default | Increase radar range |
| Scroll down | Default | Decrease radar range |
| Scroll | In menu | Navigate menu items (accessibility alternative) |

### 3.4 Radial Menu

Right-click opens a radial menu centered on cursor position. Menu contents depend on context.

**Near player aircraft:**
- Countermeasures (chaff/flare)
- Landing gear toggle
- Flaps (up/takeoff/landing)
- Speedbrake toggle
- Weapon select

**On radar contact:**
- Lock target (STT)
- Track target (TWS)
- Designate as priority
- IFF interrogate

**On locked target:**
- Fire weapon
- Unlock
- Cycle weapon type

**Empty space:**
- Radar mode cycle
- Sensor select
- Autopilot options

---

## 4. Touch Support

Touch input follows conventions adapted for combat simulation.

### 4.1 Gesture Mapping

| Gesture | Action |
|---------|--------|
| Tap | Equivalent to left-click |
| Long-press (500ms) | Equivalent to right-click (opens radial menu) |
| Two-finger tap | Equivalent to right-click (faster alternative) |
| Drag | Pan view (if implemented) or drag dialog |
| Pinch | Radar range adjustment |

### 4.2 Touch Flight Controls

When touch input is detected, a virtual joystick overlay appears:
- **Position:** Bottom-left quadrant
- **Stick behavior:** Thumb controls stick position directly (true analog)
- **Throttle:** Slider on left edge

---

## 5. UI Architecture

### 5.1 Principles

1. **Viewport supremacy:** The 3D game view occupies 100% of screen. All UI overlays.
2. **Fade on idle:** Panels not recently interacted with fade to 30% opacity after 3 seconds.
3. **Minimize on idle (optional):** Some panels collapse to icon after extended idle (10 seconds).
4. **Wake on proximity:** Panels return to full opacity when cursor approaches.
5. **No modal dialogs during flight:** Menus and panels are always dismissable, never block input.

### 5.2 UI Layers (Bottom to Top)

| Layer | Content | Implementation |
|-------|---------|----------------|
| 1 | 3D world with Voronoi viewports | Three.js canvas |
| 2 | Minimap | Separate 2D canvas |
| 3 | Control indicators | DOM elements |
| 4 | Floating panels | DOM elements |
| 5 | Radial menus | DOM elements |
| 6 | Tooltips | DOM elements |
| 7 | Critical alerts | DOM elements (always visible) |

### 5.3 Control Indicators

Small, semi-transparent indicators in screen corners showing current control state.

#### Stick Indicator (Bottom-Left)

| Property | Value |
|----------|-------|
| Size | 60Ã—60 pixels |
| Shape | Circular |
| Elements | Outer ring (boundary), inner dot (position), cardinal tick marks |
| Opacity | 70% normal, 100% when stick not centered |

#### Throttle Indicator (Left Edge, Above Stick)

| Property | Value |
|----------|-------|
| Size | 20Ã—100 pixels |
| Shape | Vertical bar |
| Elements | Fill level, military power line, afterburner zone (orange/red) |
| Opacity | 70% normal, 100% when throttle changing |

#### Altitude Indicator (Right Edge, Optional)

| Property | Value |
|----------|-------|
| Shape | Vertical tape |
| Elements | Current altitude, trend arrow |
| Note | May be replaced by Voronoi UI cell altimeter |

### 5.4 Floating Panels

Panels are DOM elements positioned absolutely over the canvas.

**Behaviors:**
- Draggable by title bar
- Minimize button collapses to icon
- Close button hides (does not destroy)
- Remember position across sessions (localStorage)
- Fade to `idleOpacity` (default 0.3) after `idleTimeout` (default 3 seconds)
- Return to full opacity on mouse enter or focus

**Standard Panels:**
- Mission briefing
- Loadout / stores
- Settings
- Controls reference

### 5.5 Minimap

Fixed-position 2D canvas element.

**Default Position:** Bottom-right corner

**Display Elements:**
- Player aircraft (white, always center, pointing up)
- Heading rotation (map rotates so player heading is up)
- Radar contacts (hostile: red, friendly: green, unknown: yellow)
- Threat rings (SAM/AAA range circles)
- Waypoints (blue diamonds)
- Bullseye reference (if enabled)

**Specifications:**

| Property | Value |
|----------|-------|
| Size | 200Ã—200 pixels (configurable) |
| Update rate | 30fps or on state change |
| Implementation | 2D Canvas (not WebGL) |

**Interactions:**
- Click on contact: Select target
- Scroll wheel over minimap: Zoom minimap scale
- Right-click: Minimap options menu

---

## 6. Sensor Cell Rendering

Certain Voronoi cells represent sensor feeds rather than visual perspective. These have distinct rendering treatment.

### 6.1 Cell Types

| Type | Merge Behavior | Post-Processing | Use Case |
|------|----------------|-----------------|----------|
| `player` | N/A (always rendered) | None | Main player view |
| `visual` | Merge when on-screen | None | Visual-range targets |
| `radar` | Never merge | Phosphor green, scanlines | Radar contacts |
| `tgp` | Never merge | FLIR thermal or TV | Targeting pod |
| `irst` | Never merge | Blue-white thermal | Infrared search/track |

### 6.2 Radar Cell Aesthetic

Radar cells simulate a P-scope or situation display.

| Effect | Value |
|--------|-------|
| Color | Phosphor green (#33ff66) with luminance-based intensity |
| Scanlines | Horizontal lines at 2-pixel intervals, 15% darkening |
| Noise | Subtle static noise, 5% intensity |
| Bloom | Slight glow on bright contacts |
| Refresh | Optional sweep line showing radar scan position |

### 6.3 TGP Cell Aesthetic

Targeting pod cells simulate FLIR or TV sensor.

| Mode | Description |
|------|-------------|
| WHOT (white-hot) | Grayscale palette, hot objects white, cold objects black, high contrast |
| BHOT (black-hot) | Inverted grayscale, hot objects black |
| TV | Natural color, high zoom, slight vignette at edges |

### 6.4 Cell Borders

Sensor cells always render borders, even when other cells do not.

| Sensor Type | Border Color |
|-------------|--------------|
| Radar | Green (#338833) |
| TGP | Amber (#aa8833) |
| IRST | Cyan (#338888) |

---

## 7. Audio Feedback

Control inputs provide audio confirmation.

### 7.1 Control Sounds

| Action | Sound |
|--------|-------|
| Stick at limit | Subtle click |
| Stick centered | Soft detent sound |
| Afterburner engage | Engine roar increase |
| Afterburner disengage | Engine tone decrease |

### 7.2 Combat Sounds

| Action | Sound |
|--------|-------|
| Target lock acquired | Lock tone (continuous) |
| Target lock lost | Broken tone |
| Weapon release | Launch sound |
| Countermeasures | Chaff/flare dispense sound |

**Note:** RWR (Radar Warning Receiver) tones are handled separately per threat type. See combat systems specification.

---

## 8. Accessibility Considerations

### 8.1 Remappable Controls

All keyboard bindings are remappable in settings. Default WASD assumes QWERTY layout. Presets available for:
- AZERTY
- Dvorak

### 8.2 Colorblind Modes

| Mode | Hostile | Friendly | Unknown |
|------|---------|----------|---------|
| Default | Red | Green | Yellow |
| Deuteranopia | Orange | Blue | White |
| Protanopia | Orange | Blue | White |

### 8.3 Screen Reader Support

- Menu items and dialogs include ARIA labels
- Game state announcements available for critical events (lock, launch, threat)

### 8.4 Reduced Motion

Option to disable:
- Scanline animation
- Radar sweep animation
- Panel fade transitions

---

## 9. Configuration Defaults

```yaml
controls:
  stick:
    deflectRate: 2.5        # units/second
    deadzone: 0.05
    centerKey: 'KeyC'
  throttle:
    rate: 0.5               # units/second
    afterburnerRate: 2.0
    afterburnerKey: 'ShiftLeft'
  altitude:
    climbRate: 1000         # ft/min base
    descentRate: 2000

ui:
  idleTimeout: 3000         # ms before fade
  idleOpacity: 0.3
  minimapSize: 200
  minimapPosition: 'bottom-right'
  showStickIndicator: true
  showThrottleIndicator: true
  indicatorOpacity: 0.7

sensors:
  radar:
    phosphorColor: '#33ff66'
    scanlineIntensity: 0.15
    noiseIntensity: 0.05
  tgp:
    defaultMode: 'whot'
```

---

## 10. Future Considerations

### 10.1 Gamepad Support

The architecture supports direct analog input. When gamepad detected:
- Left stick maps directly to virtual stick position (bypassing deflect rate)
- Triggers map to throttle

### 10.2 Voice Commands

Potential commands: "Fox two", "Chaff flare", "Radar standby"

**Consideration:** Requires careful design to avoid false positives.

### 10.3 Head Tracking

If webcam head tracking implemented, view could pan slightly with head movement for immersion.

**Priority:** Low

---

*Specification version 1.0*  
*Voronoi Skies Control and UI Design*