# D3: {game title goes here}

# Game Design Vision

The player explores a map centered on the classroom location, where the world is divided into grid cells. Each cell may contain a token of a certain value. The player can pick up one token at a time and combine it with another token of equal value to craft a higher-value token. The goal is to create a token of sufficiently high value by collecting and combining nearby tokens.

# Technologies

- TypeScript for most game code, little to no explicit HTML, and all CSS collected in common `style.css` file
- Deno and Vite for building
- GitHub Actions + GitHub Pages for deployment automation

# Assignments

## D3.a: Core mechanics (token collection and crafting)

Key technical challenge: Can you assemble a map-based user interface using the Leaflet mapping framework?
Key gameplay challenge: Can players collect and craft tokens from nearby locations to finally make one of sufficiently high value?

### Steps

- [x] copy main.ts to reference.ts for future reference

- [x] delete everything in main.ts

- [ ] put a basic Leaflet map on the screen centered at the classroom coordinates

- [ ] disable zoom and panning to fix the player’s view

- [ ] draw the player’s location on the map with a marker

- [ ] define a grid cell size (TILE_DEGREES = 0.0001)

- [ ] draw a rectangle representing one cell on the map

- [ ] use nested loops to draw a grid of cells around the player

- [ ] use the luck() function to deterministically decide whether each cell contains a token

- [ ] assign a value to each token based on a deterministic function of its grid coordinates

- [ ] display the token’s value visually inside its cell (number or icon)

- [ ] allow the player to click only nearby cells (e.g., within 3 cells)

- [ ] when clicking a cell with a token and no token is held → pick it up

- [ ] show the held token’s value in the status panel

- [ ] when clicking a cell with a token equal to the held one → combine to make a double-value token

- [ ] remove tokens from cells as they’re collected or crafted

- [ ] detect when the player crafts a token of target value (e.g., 8 or 16) and display a success message

- [ ] visually distinguish token values with colors or symbols

- [ ] test that the map state (spawn locations and values) is consistent across page reloads
