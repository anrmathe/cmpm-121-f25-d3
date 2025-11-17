// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Styles
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";
import "./style.css";

// ----------------------
// GAME CONSTANTS
// ----------------------
const TILE_DEGREES = 0.0001; // size of grid cell (about house size)
const INTERACT_RANGE = 3; // cells away player can interact
const VIEWPORT_RADIUS = 50; // cells to keep visible around viewport
const TARGET_VALUE = 64; // higher win condition for D3.b
const CACHE_SPAWN_PROBABILITY = 0.1;

// Starting location (classroom)
const STARTING_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);

// Movement mode from query string
const urlParams = new URLSearchParams(globalThis.location.search);
const movementMode = urlParams.get("movement") || "buttons";

// ----------------------
// CELL DATA TYPE
// ----------------------
interface Cell {
  i: number;
  j: number;
}

interface CacheState {
  value: number;
}

// ----------------------
// MOVEMENT FACADE (Design Pattern)
// ----------------------
interface MovementController {
  initialize(): void;
  cleanup(): void;
}

class ButtonMovementController implements MovementController {
  initialize(): void {
    const controlPanel = document.getElementById("controlPanel")!;
    controlPanel.style.display = "block";

    document.getElementById("north")!.addEventListener("click", () => {
      movePlayer(1, 0);
    });
    document.getElementById("south")!.addEventListener("click", () => {
      movePlayer(-1, 0);
    });
    document.getElementById("west")!.addEventListener("click", () => {
      movePlayer(0, -1);
    });
    document.getElementById("east")!.addEventListener("click", () => {
      movePlayer(0, 1);
    });
  }

  cleanup(): void {
    const controlPanel = document.getElementById("controlPanel")!;
    controlPanel.style.display = "none";
  }
}

class GeolocationMovementController implements MovementController {
  private watchId: number | null = null;

  initialize(): void {
    const controlPanel = document.getElementById("controlPanel")!;
    controlPanel.style.display = "none";

    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (position) => {
        const newLatLng = leaflet.latLng(
          position.coords.latitude,
          position.coords.longitude,
        );

        const newCell = latLngToCell(newLatLng);

        // Only update if cell changed
        if (newCell.i !== playerCell.i || newCell.j !== playerCell.j) {
          playerCell = newCell;
          playerPosition = newLatLng;
          playerMarker.setLatLng(playerPosition);
          map.panTo(playerPosition);
          updateStatusPanel();
          saveGameState();
        }
      },
      (error) => {
        console.error("Geolocation error:", error);
        alert("Unable to get your location: " + error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 5000,
      },
    );
  }

  cleanup(): void {
    if (this.watchId !== null) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

// ----------------------
// SETUP UI
// ----------------------
const controlPanel = document.createElement("div");
controlPanel.id = "controlPanel";
controlPanel.innerHTML = `
  <button id="north">⬆</button>
  <button id="south">⬇</button>
  <button id="west">⬅</button>
  <button id="east">➡</button>
  <button id="reset">🔄 Reset Position</button>
`;
document.body.append(controlPanel);

const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

// Movement mode switcher and new game button
const modePanel = document.createElement("div");
modePanel.id = "modePanel";
modePanel.style.cssText =
  "position: absolute; top: 10px; right: 10px; z-index: 1000; background: white; padding: 10px; border-radius: 5px; box-shadow: 0 2px 4px rgba(0,0,0,0.2);";
modePanel.innerHTML = `
  <div style="margin-bottom: 5px;">
    <strong>Mode:</strong> ${
  movementMode === "geolocation" ? "📍 GPS" : "🎮 Buttons"
}
  </div>
  <button id="switchMode" style="margin-bottom: 5px; width: 100%;">
    Switch to ${movementMode === "geolocation" ? "Buttons" : "GPS"}
  </button>
  <button id="newGame" style="width: 100%;">New Game</button>
`;
document.body.append(modePanel);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// ----------------------
// INIT MAP
// ----------------------
const map = leaflet.map(mapDiv, {
  center: STARTING_LATLNG,
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  })
  .addTo(map);

// Player marker
let playerPosition = STARTING_LATLNG;
const playerMarker = leaflet.marker(playerPosition).addTo(map);
playerMarker.bindTooltip("That's you!");

// ----------------------
// GAME STATE
// ----------------------
// Persistent cache states (Memento pattern) - only stores modified caches
const cacheStates = new Map<string, CacheState>();

// Active caches currently visible on map (Flyweight pattern)
const activeCaches = new Map<string, {
  rect: leaflet.Rectangle;
  marker: leaflet.Marker;
  cell: Cell;
}>();

// Player inventory
let playerInventory: number | null = null;

// Player position in grid coordinates
let playerCell: Cell;

// Movement controller
let movementController: MovementController;

// ----------------------
// LOCALSTORAGE PERSISTENCE
// ----------------------
interface GameState {
  playerCell: Cell;
  playerInventory: number | null;
  cacheStates: [string, CacheState][];
}

function saveGameState() {
  const state: GameState = {
    playerCell,
    playerInventory,
    cacheStates: Array.from(cacheStates.entries()),
  };
  localStorage.setItem("geocacheGameState", JSON.stringify(state));
}

function loadGameState(): boolean {
  const saved = localStorage.getItem("geocacheGameState");
  if (!saved) return false;

  try {
    const state: GameState = JSON.parse(saved);
    playerCell = state.playerCell;
    playerInventory = state.playerInventory;
    cacheStates.clear();
    state.cacheStates.forEach(([key, value]) => {
      cacheStates.set(key, value);
    });

    // Update player position
    playerPosition = cellToLatLng(playerCell);
    playerMarker.setLatLng(playerPosition);
    map.setView(playerPosition);

    return true;
  } catch (e) {
    console.error("Failed to load game state:", e);
    return false;
  }
}

function resetGame() {
  if (!confirm("Start a new game? This will reset all progress.")) {
    return;
  }

  localStorage.removeItem("geocacheGameState");
  cacheStates.clear();
  playerInventory = null;
  playerCell = latLngToCell(STARTING_LATLNG);
  playerPosition = STARTING_LATLNG;
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);

  // Clear and regenerate caches
  activeCaches.forEach((cache) => {
    cache.rect.remove();
    cache.marker.remove();
  });
  activeCaches.clear();

  regenerateCaches();
  updateStatusPanel();
  saveGameState();
}

// ----------------------
// CELL COORDINATE FUNCTIONS
// ----------------------
function cellKey(cell: Cell): string {
  return `${cell.i},${cell.j}`;
}

function latLngToCell(latLng: leaflet.LatLng): Cell {
  // Convert from Null Island coordinate system
  const i = Math.floor(latLng.lat / TILE_DEGREES);
  const j = Math.floor(latLng.lng / TILE_DEGREES);
  return { i, j };
}

function cellToLatLng(cell: Cell): leaflet.LatLng {
  // Convert to lat/lng using Null Island as origin
  const lat = cell.i * TILE_DEGREES;
  const lng = cell.j * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

function getCellBounds(cell: Cell): leaflet.LatLngBounds {
  const nw = cellToLatLng(cell);
  const se = cellToLatLng({ i: cell.i + 1, j: cell.j + 1 });
  return leaflet.latLngBounds(nw, se);
}

function canInteract(cell: Cell): boolean {
  const di = Math.abs(cell.i - playerCell.i);
  const dj = Math.abs(cell.j - playerCell.j);
  return di <= INTERACT_RANGE && dj <= INTERACT_RANGE;
}

function determineCacheValue(cell: Cell): number {
  // Deterministic spawning of token values (2, 4, or 8)
  const valueSeed = luck(`${cell.i},${cell.j},value`);
  const powerOf2 = 1 + Math.floor(valueSeed * 3); // 1, 2, or 3
  return Math.pow(2, powerOf2); // 2, 4, or 8
}

function getCacheValue(cell: Cell): number {
  // Check if we have a stored state (Memento pattern)
  const key = cellKey(cell);
  const stored = cacheStates.get(key);

  if (stored !== undefined) {
    return stored.value;
  }

  // Otherwise, return the deterministic initial value
  return determineCacheValue(cell);
}

function setCacheValue(cell: Cell, value: number) {
  // Store the modified state (Memento pattern)
  const key = cellKey(cell);
  cacheStates.set(key, { value });
}

function shouldSpawnCache(cell: Cell): boolean {
  const spawnChance = luck(`${cell.i},${cell.j},spawn`);
  return spawnChance < CACHE_SPAWN_PROBABILITY;
}

// ----------------------
// STATUS UPDATE
// ----------------------
function updateStatusPanel() {
  const cellInfo = `Position: (${playerCell.i}, ${playerCell.j})`;
  let inventoryInfo: string;

  if (playerInventory === null) {
    inventoryInfo = "Inventory: Empty";
  } else {
    inventoryInfo = `Inventory: Token [${playerInventory}]`;
    if (playerInventory >= TARGET_VALUE) {
      inventoryInfo += "<br>🎉 <strong>Victory! You crafted a token worth " +
        TARGET_VALUE + " or more!</strong>";
    }
  }

  statusPanel.innerHTML = `<strong>${cellInfo}</strong><br>${inventoryInfo}`;
}

// ----------------------
// CACHE MANAGEMENT
// ----------------------
function createCacheVisual(cell: Cell) {
  const key = cellKey(cell);

  // Don't create if already exists
  if (activeCaches.has(key)) return;

  // Check if cache should spawn
  if (!shouldSpawnCache(cell)) return;

  const bounds = getCellBounds(cell);

  // Get current value (either stored or initial) - Memento pattern
  let cacheValue = getCacheValue(cell);

  // Create rectangle for the cell
  const rect = leaflet.rectangle(bounds, {
    color: "#555",
    weight: 1,
    fillOpacity: 0.2,
  }).addTo(map);

  // Create label showing token value
  const labelDiv = document.createElement("div");
  labelDiv.className = "cache-label";
  labelDiv.innerHTML = `<strong>${cacheValue}</strong>`;
  labelDiv.style.fontSize = "14px";
  labelDiv.style.fontWeight = "bold";
  labelDiv.style.textAlign = "center";

  const labelIcon = leaflet.divIcon({
    className: "cache-icon",
    html: labelDiv,
    iconSize: [40, 40],
  });

  const marker = leaflet.marker(bounds.getCenter(), {
    icon: labelIcon,
  }).addTo(map);

  // Store reference (Flyweight pattern - only visible caches)
  activeCaches.set(key, { rect, marker, cell });

  // Update visual
  function updateVisual() {
    if (cacheValue > 0) {
      labelDiv.innerHTML = `<strong>${cacheValue}</strong>`;
      labelDiv.style.display = "block";
      rect.setStyle({ fillOpacity: 0.2 });
    } else {
      labelDiv.innerHTML = "";
      labelDiv.style.display = "none";
      rect.setStyle({ fillOpacity: 0.05 });
    }
  }

  // Interaction handler
  function handleInteraction() {
    // Check interaction range
    if (!canInteract(cell)) {
      alert("Too far away! Move closer to interact.");
      return;
    }

    // Case 1: Pick up token
    if (playerInventory === null && cacheValue > 0) {
      playerInventory = cacheValue;
      cacheValue = 0;
      setCacheValue(cell, cacheValue); // Persist state
      updateVisual();
      updateStatusPanel();
      saveGameState();
      return;
    }

    // Case 2: Craft - combine equal tokens
    if (
      playerInventory !== null && cacheValue > 0 &&
      playerInventory === cacheValue
    ) {
      cacheValue = playerInventory * 2;
      playerInventory = null;
      setCacheValue(cell, cacheValue); // Persist state
      updateVisual();
      updateStatusPanel();
      saveGameState();
      return;
    }

    // Case 3: Place token into empty cache
    if (playerInventory !== null && cacheValue === 0) {
      cacheValue = playerInventory;
      playerInventory = null;
      setCacheValue(cell, cacheValue); // Persist state
      updateVisual();
      updateStatusPanel();
      saveGameState();
      return;
    }

    alert("Nothing happens. Try picking up or combining matching tokens!");
  }

  // Click handlers
  rect.on("click", handleInteraction);
  marker.on("click", handleInteraction);

  // Hover effects
  rect.on("mouseover", () => {
    if (canInteract(cell)) {
      rect.setStyle({ color: "#00ff00", weight: 2 });
    } else {
      rect.setStyle({ color: "#ff0000", weight: 2 });
    }
  });

  rect.on("mouseout", () => {
    rect.setStyle({ color: "#555", weight: 1 });
  });

  updateVisual();
}

function removeCacheVisual(cell: Cell) {
  const key = cellKey(cell);
  const cache = activeCaches.get(key);

  if (cache) {
    cache.rect.remove();
    cache.marker.remove();
    activeCaches.delete(key);
  }
}

function getVisibleCells(): Cell[] {
  const bounds = map.getBounds();
  const nwCell = latLngToCell(bounds.getNorthWest());
  const seCell = latLngToCell(bounds.getSouthEast());

  const cells: Cell[] = [];

  // Add buffer around visible area
  for (
    let i = nwCell.i - VIEWPORT_RADIUS;
    i <= seCell.i + VIEWPORT_RADIUS;
    i++
  ) {
    for (
      let j = nwCell.j - VIEWPORT_RADIUS;
      j <= seCell.j + VIEWPORT_RADIUS;
      j++
    ) {
      cells.push({ i, j });
    }
  }

  return cells;
}

function regenerateCaches() {
  const visibleCells = getVisibleCells();
  const visibleKeys = new Set(visibleCells.map(cellKey));

  // Remove caches no longer visible (Flyweight - free memory)
  for (const [key, cache] of activeCaches) {
    if (!visibleKeys.has(key)) {
      removeCacheVisual(cache.cell);
    }
  }

  // Add new visible caches (restore from Memento if modified)
  for (const cell of visibleCells) {
    createCacheVisual(cell);
  }
}

// ----------------------
// PLAYER MOVEMENT
// ----------------------
function movePlayer(di: number, dj: number) {
  // Update player cell position
  playerCell = { i: playerCell.i + di, j: playerCell.j + dj };

  // Update player marker position
  playerPosition = cellToLatLng(playerCell);
  playerMarker.setLatLng(playerPosition);

  // Center map on player
  map.panTo(playerPosition);

  updateStatusPanel();
  saveGameState();
}

// ----------------------
// EVENT HANDLERS
// ----------------------
document.getElementById("reset")!.addEventListener("click", () => {
  playerPosition = STARTING_LATLNG;
  playerCell = latLngToCell(playerPosition);
  playerMarker.setLatLng(playerPosition);
  map.setView(playerPosition);
  updateStatusPanel();
  saveGameState();
});

document.getElementById("newGame")!.addEventListener("click", resetGame);

document.getElementById("switchMode")!.addEventListener("click", () => {
  const newMode = movementMode === "geolocation" ? "buttons" : "geolocation";
  globalThis.location.href = `?movement=${newMode}`;
});

// Map movement (scrolling)
map.on("moveend", () => {
  regenerateCaches();
});

// ----------------------
// INITIALIZATION
// ----------------------
// Try to load saved game state
const stateLoaded = loadGameState();

if (!stateLoaded) {
  // No saved state, start fresh
  playerCell = latLngToCell(STARTING_LATLNG);
  playerPosition = STARTING_LATLNG;
}

// Initialize movement controller based on mode (Facade pattern)
if (movementMode === "geolocation") {
  movementController = new GeolocationMovementController();
} else {
  movementController = new ButtonMovementController();
}

movementController.initialize();
regenerateCaches();
updateStatusPanel();
