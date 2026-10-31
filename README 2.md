# Kimetsu World Engine v0.2.1

A bilingual Thai/English SillyTavern RPG extension starter for Kimetsu no Yaiba roleplay.

## RPG features
- Player character sheet: level, EXP, rank, HP, stamina, attack, defense, speed, money and skill points
- Level-up progression with stat growth and full HP/stamina recovery
- Custom breathing skills with stamina costs and damage multipliers
- Turn-based combat against three sample demon templates
- Enemy scaling based on player level
- Battle log, victory rewards, defeat and flee states
- Inventory with consumable healing and stamina items
- Custom mission creation, completion and EXP/money rewards
- Rest action to restore HP and stamina
- NPC creation/edit/delete, trust, memories and relationship records
- Per-chat world location, time, and event memories
- Character header/dialogue/monologue/narration/status prompt instructions
- Insertable RPG context prompt and JSON backup export

## Install
1. Put all files at the root of a public GitHub repository.
2. In SillyTavern: Extensions > Install extension > paste the repository URL.
3. Reload SillyTavern, enable **Kimetsu World Engine** and open its panel in Extensions settings.

Manual install: copy the folder into `SillyTavern/data/<user-handle>/extensions/`.

## Storage
- Global character/RPG/NPC/mission data: SillyTavern extension settings.
- World state, combat encounter and event memories: per-chat metadata.
- Use Overview > Export JSON to back up the global settings and current chat metadata.

## Important limitations in 0.2.1
- Combat calculations, EXP, items, missions and stats are managed by the extension.
- The extension inserts a generated context block into the chat input for the user to review and send. It does not silently modify prompts or parse model replies automatically.
- NPC memory and relationships are manually recorded in this version; automatic extraction and relationship evolution are planned for a later version.
- The extension uses SillyTavern's `SillyTavern.getContext()` and the standard extension settings/chat metadata interfaces. Compatibility should be verified against the user's installed SillyTavern build.

## Roadmap
- Import/export character and NPC packs
- Automatic structured response parser and state update confirmation
- Mission objectives and branching quest lines
- More breathing styles, forms, demon blood arts and boss mechanics
- NPC relationship matrix and memory retrieval
- Localization file system and automated tests
