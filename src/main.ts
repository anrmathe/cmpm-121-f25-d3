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
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
const TILE_DEGREES = 0.0001; // size of grid cell (about house size)
const INTERACT_RANGE = 10; // cells away player can interact
const WORLD_RADIUS = 50; // cells to render in each direction
const TARGET_VALUE = 16; // win condition value
const CACHE_SPAWN_PROBABILITY = 0.1;

// ----------------------
// SETUP UI
// ----------------------
const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

// ----------------------
// INIT MAP
// ----------------------
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: 19,
  minZoom: 19,
  maxZoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  })
  .addTo(map);

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map);
playerMarker.bindTooltip("That's you!");

// ----------------------
// GAME STATE
// ----------------------
interface CacheData {
  i: number;
  j: number;
  value: number;
}

// Store cache states
const caches = new Map<string, CacheData>();

// Player inventory
let playerInventory: number | null = null;

// Player position in grid coordinates
const playerGridPos = { i: 0, j: 0 };

// ----------------------
// HELPER FUNCTIONS
// ----------------------
function cellKey(i: number, j: number): string {
  return `${i},${j}`;
}

function latLngToCell(lat: number, lng: number): { i: number; j: number } {
  const i = Math.floor((lat - CLASSROOM_LATLNG.lat) / TILE_DEGREES);
  const j = Math.floor((lng - CLASSROOM_LATLNG.lng) / TILE_DEGREES);
  return { i, j };
}

function cellToLatLng(i: number, j: number): leaflet.LatLng {
  const lat = CLASSROOM_LATLNG.lat + i * TILE_DEGREES;
  const lng = CLASSROOM_LATLNG.lng + j * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

function canInteract(i: number, j: number): boolean {
  const di = Math.abs(i - playerGridPos.i);
  const dj = Math.abs(j - playerGridPos.j);
  return di <= INTERACT_RANGE && dj <= INTERACT_RANGE;
}

function determineCacheValue(i: number, j: number): number {
  // Deterministic spawning of token values (2, 4, or 8)
  const valueSeed = luck(`${i},${j},value`);
  const powerOf2 = 1 + Math.floor(valueSeed * 3); // 1, 2, or 3
  return Math.pow(2, powerOf2); // 2, 4, or 8
}

function updateStatusPanel() {
  if (playerInventory === null) {
    statusPanel.innerHTML = "<strong>Inventory:</strong> Empty";
  } else {
    statusPanel.innerHTML =
      `<strong>Inventory:</strong> Token [${playerInventory}]`;
    if (playerInventory >= TARGET_VALUE) {
      statusPanel.innerHTML +=
        "<br>🎉 <strong>Victory! You crafted a token worth " +
        TARGET_VALUE + " or more!</strong>";
    }
  }
}

// ----------------------
// CACHE SPAWNING
// ----------------------
function spawnCache(i: number, j: number) {
  const key = cellKey(i, j);

  // Check if cache should spawn here (deterministic)
  const spawnChance = luck(`${i},${j},spawn`);
  if (spawnChance >= CACHE_SPAWN_PROBABILITY) {
    return; // No cache here
  }

  // Determine initial value
  const initialValue = determineCacheValue(i, j);

  // Store cache data
  caches.set(key, { i, j, value: initialValue });

  // Create visual representation
  const origin = cellToLatLng(i, j);
  const bounds = leaflet.latLngBounds([
    [origin.lat, origin.lng],
    [origin.lat + TILE_DEGREES, origin.lng + TILE_DEGREES],
  ]);

  // Create rectangle for the cell
  const rect = leaflet.rectangle(bounds, {
    color: "#555",
    weight: 1,
    fillOpacity: 0.2,
  }).addTo(map);

  // Create label showing token value
  const labelDiv = document.createElement("div");
  labelDiv.className = "cache-label";
  labelDiv.innerHTML = `<strong>${initialValue}</strong>`;
  labelDiv.style.fontSize = "14px";
  labelDiv.style.fontWeight = "bold";
  labelDiv.style.textAlign = "center";

  const labelIcon = leaflet.divIcon({
    className: "cache-icon",
    html: labelDiv,
    iconSize: [40, 40],
  });

  const labelMarker = leaflet.marker(bounds.getCenter(), {
    icon: labelIcon,
  }).addTo(map);

  // Update visual based on cache state
  function updateVisual() {
    const cache = caches.get(key);
    if (cache && cache.value > 0) {
      labelDiv.innerHTML = `<strong>${cache.value}</strong>`;
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
    const cache = caches.get(key);
    if (!cache) return;

    // Check interaction range
    if (!canInteract(i, j)) {
      alert(
        "Too far away! You can only interact with cells within " +
          INTERACT_RANGE + " cells of your location.",
      );
      return;
    }

    // Case 1: Pick up token (inventory empty, cache has token)
    if (playerInventory === null && cache.value > 0) {
      playerInventory = cache.value;
      cache.value = 0;
      updateVisual();
      updateStatusPanel();
      return;
    }

    // Case 2: Craft - combine equal tokens
    if (
      playerInventory !== null && cache.value > 0 &&
      playerInventory === cache.value
    ) {
      cache.value = playerInventory * 2;
      playerInventory = null;
      updateVisual();
      updateStatusPanel();
      return;
    }

    // Case 3: Place token into empty cache
    if (playerInventory !== null && cache.value === 0) {
      cache.value = playerInventory;
      playerInventory = null;
      updateVisual();
      updateStatusPanel();
      return;
    }

    // No valid action
    alert(
      "Nothing happens. Try picking up a token or combining matching tokens!",
    );
  }

  // Click handlers
  rect.on("click", handleInteraction);
  labelMarker.on("click", handleInteraction);

  // Hover effects
  rect.on("mouseover", () => {
    if (canInteract(i, j)) {
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

// ----------------------
// INITIALIZE WORLD
// ----------------------
function initializeWorld() {
  // Spawn caches in a large area around the player
  for (let i = -WORLD_RADIUS; i <= WORLD_RADIUS; i++) {
    for (let j = -WORLD_RADIUS; j <= WORLD_RADIUS; j++) {
      spawnCache(i, j);
    }
  }
}

// ----------------------
// START GAME
// ----------------------
initializeWorld();
updateStatusPanel();
