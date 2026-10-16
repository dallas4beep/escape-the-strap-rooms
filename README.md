# Escape the Strap Rooms

First-person horror game in the browser. Find the carabiner, get to the exit, and don't let Community Strap catch you.

## Folders

- `public/` is the website. Vercel serves this folder.
- `src/` is the game code. `npm run build` bundles it into `public/game.js`.
- `public/data/dialogue.json` holds every NPC line. `public/data/credits.json` is the credits screen.
- `public/assets/` holds the level, characters, music, and videos.
- `tools/` has the scripts that prepared the assets.
- `dialogue.md` is the readable version of the dialogue.

## Changing dialogue

Edit `dialogue.md`, then run:

    node tools/dialogue_to_json.mjs dialogue.md public/data/dialogue.json

Or edit `public/data/dialogue.json` directly. No rebuild needed for either.

## Changing code

    npm install
    npm run build

Vercel runs the build itself on every push.

## Running locally

Serve the `public` folder with any static server, for example:

    npx serve public
