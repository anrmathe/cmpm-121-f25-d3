// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";

// Styles
import "leaflet/dist/leaflet.css";
import "./_leafletWorkaround.ts"; // Fix missing marker icons
import luck from "./_luck.ts";
import "./style.css";

// ----------------------
// GAME CONSTANTS
// ----------------------
const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
const TILE_DEGREES = 0.0001; // size of grid cell
const INTERACT_RANGE = 3; // how far player can interact (in cells)
const WORLD_RADIUS = 50; // cells to draw in each direction
const TARGET_VALUE = 16; // win value

// ----------------------
// SETUP UI
// ----------------------
const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanel = document.createElement("div");
statusPanel.id = "statusPanel";
document.body.append(statusPanel);

// ----------------------
// INIT MAP
// ----------------------
const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: 17,
  zoomControl: true,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors",
  })
  .addTo(map);

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map);
playerMarker.bindTooltip("You are here");

// ----------------------
// STATE
// ----------------------
interface Cell {
  i: number;
  j: number;
  value: number | null;
  rect: leaflet.Rectangle;
  label: HTMLElement;
}

const cells: Record<string, Cell> = {};
let playerHeldToken: number | null = null;
const playerPos = { i: 0, j: 0 };

// ----------------------
// HELPERS
// ----------------------
function cellKey(i: number, j: number) {
  return `${i},${j}`;
}

function worldToLatLng(i: number, j: number) {
  const lat = CLASSROOM_LATLNG.lat + i * TILE_DEGREES;
  const lng = CLASSROOM_LATLNG.lng + j * TILE_DEGREES;
  return leaflet.latLng(lat, lng);
}

function spawnValue(i: number, j: number): number | null {
  const spawnChance = luck(`${i},${j},spawn`);
  if (spawnChance < 0.1) {
    return Math.pow(2, 1 + Math.floor(luck(`${i},${j},value`) * 3)); // 2, 4, 8
  }
  return null;
}

function canInteract(i: number, j: number): boolean {
  const di = Math.abs(i - playerPos.i);
  const dj = Math.abs(j - playerPos.j);
  return di <= INTERACT_RANGE && dj <= INTERACT_RANGE;
}

function updateStatus() {
  if (playerHeldToken === null) {
    statusPanel.innerHTML = "Inventory: empty";
  } else {
    statusPanel.innerHTML = `Inventory: holding token [${playerHeldToken}]`;
    if (playerHeldToken >= TARGET_VALUE) {
      statusPanel.innerHTML +=
        "<br><strong>🎉 You’ve crafted a powerful token!</strong>";
    }
  }
}

// ----------------------
// CREATE CELL
// ----------------------
function createCell(i: number, j: number) {
  const key = cellKey(i, j);
  if (cells[key]) return;

  const nw = worldToLatLng(i, j);
  const se = worldToLatLng(i + 1, j + 1);
  const bounds = leaflet.latLngBounds(nw, se);

  const val = spawnValue(i, j);

  const rect = leaflet.rectangle(bounds, {
    color: "#777",
    weight: 1,
    fillOpacity: 0.1,
  }).addTo(map);

  // visible label for token
  const label = document.createElement("div");
  label.className = "token-label";
  label.innerText = val ? `${val}` : "";
  const labelIcon = leaflet.divIcon({
    className: "token-icon",
    html: label,
    iconSize: [30, 30],
  });
  const labelMarker = leaflet.marker(bounds.getCenter(), { icon: labelIcon })
    .addTo(map);

  cells[key] = { i, j, value: val, rect, label };

  rect.on("click", () => onCellClick(i, j));
  labelMarker.on("click", () => onCellClick(i, j));
  rect.on("mouseover", () => {
    if (canInteract(i, j)) rect.setStyle({ color: "lime" });
    else rect.setStyle({ color: "red" });
  });
  rect.on("mouseout", () => rect.setStyle({ color: "#777" }));
}

// ----------------------
// INTERACTION
// ----------------------
function onCellClick(i: number, j: number) {
  const cell = cells[cellKey(i, j)];
  if (!cell) return;

  if (!canInteract(i, j)) {
    const cellCenter = worldToLatLng(i + 0.5, j + 0.5);
    const metersPerCell = TILE_DEGREES * 111_320; // approximate meters per cell
    alert("Too far away to interact!");
    console.log(map.distance(playerMarker.getLatLng(), cellCenter));
    console.log(INTERACT_RANGE * metersPerCell);
    return;
  }

  // PICK UP
  if (cell.value && playerHeldToken === null) {
    playerHeldToken = cell.value;
    cell.value = null;
    cell.label.innerText = "";
    updateStatus();
    return;
  }

  // CRAFT (double)
  if (playerHeldToken && cell.value && cell.value === playerHeldToken) {
    cell.value *= 2;
    playerHeldToken = null;
    cell.label.innerText = `${cell.value}`;
    updateStatus();
    return;
  }

  // PLACE token down (optional)
  if (playerHeldToken && !cell.value) {
    cell.value = playerHeldToken;
    playerHeldToken = null;
    cell.label.innerText = `${cell.value}`;
    updateStatus();
    return;
  }

  alert("Nothing interesting happens.");
}

// ----------------------
// WORLD SETUP
// ----------------------
for (let i = -WORLD_RADIUS; i <= WORLD_RADIUS; i++) {
  for (let j = -WORLD_RADIUS; j <= WORLD_RADIUS; j++) {
    createCell(i, j);
  }
}

updateStatus();
