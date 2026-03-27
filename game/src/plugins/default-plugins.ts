import type { CharacterPlugin } from './contracts.js';
import { baron_plugin } from './characters/baron.js';
import { butler_plugin } from './characters/butler.js';
import { chef_plugin } from './characters/chef.js';
import { demoninfo_plugin } from './characters/demoninfo.js';
import { drunk_plugin } from './characters/drunk.js';
import { empath_plugin } from './characters/empath.js';
import { fortune_teller_plugin } from './characters/fortune-teller.js';
import { imp_plugin } from './characters/imp.js';
import { investigator_plugin } from './characters/investigator.js';
import { librarian_plugin } from './characters/librarian.js';
import { mayor_plugin } from './characters/mayor.js';
import { minioninfo_plugin } from './characters/minioninfo.js';
import { monk_plugin } from './characters/monk.js';
import { poisoner_plugin } from './characters/poisoner.js';
import { ravenkeeper_plugin } from './characters/ravenkeeper.js';
import { recluse_plugin } from './characters/recluse.js';
import { saint_plugin } from './characters/saint.js';
import { scarlet_woman_plugin } from './characters/scarlet-woman.js';
import { slayer_plugin } from './characters/slayer.js';
import { soldier_plugin } from './characters/soldier.js';
import { spy_plugin } from './characters/spy.js';
import { undertaker_plugin } from './characters/undertaker.js';
import { virgin_plugin } from './characters/virgin.js';
import { washerwoman_plugin } from './characters/washerwoman.js';

export const DEFAULT_CHARACTER_PLUGINS: CharacterPlugin[] = [
  baron_plugin,
  butler_plugin,
  chef_plugin,
  demoninfo_plugin,
  drunk_plugin,
  empath_plugin,
  fortune_teller_plugin,
  imp_plugin,
  investigator_plugin,
  librarian_plugin,
  mayor_plugin,
  minioninfo_plugin,
  monk_plugin,
  poisoner_plugin,
  ravenkeeper_plugin,
  recluse_plugin,
  saint_plugin,
  scarlet_woman_plugin,
  slayer_plugin,
  soldier_plugin,
  spy_plugin,
  undertaker_plugin,
  virgin_plugin,
  washerwoman_plugin
];
