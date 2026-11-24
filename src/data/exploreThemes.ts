/**
 * Temas e tribos da aba Explorar.
 *
 * Os nomes seguem o EDHREC (edhrec.com/tags/themes e /tags/typal), mas a busca é nossa:
 * cada tema é uma consulta do Scryfall aplicada sobre `is:commander` (texto das cartas,
 * não dados de decks). Contagem de commanders e arte de capa vêm de `exploreMeta.json`,
 * gerado por `node scripts/build-explore-data.ts`.
 */

export type ExploreKind = 'theme' | 'tribe';

export interface ExploreTheme {
  slug: string;
  name: string;
  kind: ExploreKind;
  /** Consulta do Scryfall (sem o `is:commander`, que é aplicado sempre). */
  query: string;
}

/**
 * Quem conta como commander. O `is:commander` do Scryfall esconde os banidos, então eles
 * entram de volta à parte (a página mostra o aviso "Banido").
 */
export const COMMANDER_BASE = '(is:commander or (banned:commander (t:legendary t:creature or o:"can be your commander")))';
/** Backgrounds ficam fora, a não ser que o filtro esteja ligado. */
export const NO_BACKGROUNDS = '-t:background';

/** Tribos com menos commanders que isso ficam fora da grade. */
export const MIN_TRIBE_COMMANDERS = 20;

const slugify = (s: string) =>
  s.toLowerCase().replace(/\+1\/\+1/g, 'plus-1').replace(/-1\/-1/g, 'minus-1').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const theme = (name: string, query: string): ExploreTheme => ({ slug: slugify(name), name, kind: 'theme', query });

// prettier-ignore
export const THEMES: ExploreTheme[] = [
  theme('+1/+1 Counters', 'o:"+1/+1 counter"'),
  theme('-1/-1 Counters', 'o:"-1/-1 counter"'),
  theme('Adventures', 'o:adventure'),
  theme('Affinity', 'keyword:affinity or o:"for each artifact you control"'),
  theme('Airbending', 'o:airbend'),
  theme('Amass', 'o:amass'),
  theme('Anthems', 'o:/creatures you control get \\+/'),
  theme('Aristocrats', 'o:/whenever (a|another) (nontoken )?creature (you control )?dies|whenever you sacrifice|sacrifice another|creature dying/'),
  theme('Artifacts', 'o:/artifacts? you control|artifact spells?|whenever an artifact|artifact enters/'),
  theme('Attack Triggers', 'o:/whenever [^.]* attacks/'),
  theme('Attractions', 'o:attraction'),
  theme('Auras', 'o:/\\bauras?\\b/'),
  theme('Birthing Pod', 'o:/sacrifice [^.]*search your library for a creature card with mana value/'),
  theme('Blink', 'o:/exile [^.]*(then )?return (it|that card|them|those cards) to the battlefield/'),
  theme('Blood', 'o:"blood token"'),
  theme('Bounce', `o:"to its owner's hand" or o:"to their owners' hands"`),
  theme('Burn', 'o:/damage to each opponent|noncombat damage/'),
  theme('Card Draw', 'o:/whenever (you|a player|an opponent) draws?|second card each turn|draw an additional card/'),
  theme('Cascade', 'keyword:cascade or o:cascade'),
  theme('Charge Counters', 'o:"charge counter"'),
  theme('Clones', 'o:/copy of (target|a|another|each)[^.]*creature|becomes? a copy|enter as a copy/'),
  theme('Clues', 'o:clue'),
  theme('Coin Flip', 'o:"flip a coin" or o:"flip one or more coins"'),
  theme('Commander Matters', 'o:/your commanders?|command zone/'),
  theme('Connive', 'o:connive'),
  theme('Convoke', 'o:convoke'),
  theme('Counters Matter', 'o:/(one or more|any) counters?|each kind of counter|counter of each kind/'),
  theme('Counterspells', 'o:/counter target [^.]*spell|whenever you counter/'),
  theme('Crime', 'o:"commit a crime" or o:"committed a crime"'),
  theme('Curses', 'o:curse'),
  theme('Cycling', 'keyword:cycling or o:/\\bcycle/'),
  theme('Deathtouch', 'o:/(have|has|gains?) deathtouch|with deathtouch/'),
  theme('Defenders', 'o:defender'),
  theme('Delirium', 'o:delirium'),
  theme('Deserts', 'o:desert'),
  theme('Devotion', 'o:devotion'),
  theme('Die Roll', 'o:/roll(s)? (a|one or more|two|that many) (d\\d+|dice|die|six-sided)/'),
  theme('Discard', 'o:/(each opponent|target (player|opponent)|each player) discards|whenever (an opponent|a player) discards/'),
  theme('Discover', 'keyword:discover or o:discover'),
  theme('Donate', 'o:/target opponent gains control|exchange control/'),
  theme('Dredge', 'keyword:dredge or o:dredge'),
  theme('Dungeon', 'o:/venture into the dungeon|initiative|dungeon/'),
  theme('Earthbending', 'o:earthbend'),
  theme('Enchantress', 'o:/enchantment spells?|enchantments you control|whenever an enchantment|enchantment enters/'),
  theme('Energy', 'o:{E}'),
  theme('Enrage', 'o:enrage or o:"is dealt damage"'),
  theme('Equipment', 'o:/\\bequip(ment|ped)?\\b/'),
  theme('ETB', 'o:/whenever (another|a|one or more) (nontoken )?(creatures?|permanents?) (you control )?enters?/'),
  theme('Evoke', 'o:evoke'),
  theme('Exalted', 'keyword:exalted or o:exalted'),
  theme('Exile', 'o:/cards? in exile|from exile|exiled cards?/'),
  theme('Experience Counters', 'o:"experience counter"'),
  theme('Explore', 'o:explore'),
  theme('Extra Combats', 'o:"additional combat phase"'),
  theme('Extra Turns', 'o:"extra turn"'),
  theme('Fight', 'o:/\\bfights?\\b/'),
  theme('Firebending', 'o:firebend'),
  theme('Flash', 'o:/(have|has) flash|as though (it|they) had flash/'),
  theme('Flashback', 'keyword:flashback or o:flashback'),
  theme('Flying', 'o:/creatures? (you control )?with flying|(have|has|gains?) flying/'),
  theme('Food', 'o:food'),
  theme('Forced Combat', 'o:/goad|attacks each combat if able|must attack/'),
  theme('Foretell', 'keyword:foretell or o:foretell'),
  theme('Go Wide', 'o:/for each creature you control|number of creatures you control/'),
  theme('Graveyard', 'o:/from (your|a) graveyard|cards? in (your|a) graveyard/'),
  theme('Group Hug', 'o:/each player (draws|may draw|adds|may put)/'),
  theme('Group Slug', 'o:/(each|that) player (loses|sacrifices|discards)|damage to each player/'),
  theme('Guildgates', 'o:/\\bgates?\\b/'),
  theme('Hand Size', 'o:"maximum hand size"'),
  theme('Haste', 'o:/(have|has|gains?) haste/'),
  theme('Historic', 'o:historic'),
  theme('Impulse Draw', 'o:/exile the top [^.]*\\. (until [^.]*, )?you may (play|cast)/'),
  theme('Indestructible', 'o:/(have|has|gains?) indestructible/'),
  theme('Infect', 'keyword:infect or o:/infect|poison counter|toxic/'),
  theme('Land Animation', 'o:/lands? (you control )?(is|are|becomes?) [^.]*creatures?/'),
  theme('Land Destruction', 'o:/destroy (target|all|each) (nonbasic )?lands?|sacrifices? (a|two|x) lands?/'),
  theme('Landfall', 'keyword:landfall or o:/whenever a land (you control )?enters/'),
  theme('Lands Matter', 'o:/lands? you control|play an additional land|land cards?|whenever a land/'),
  theme('Legends', 'o:/legendary (creature|spell|permanent)s?/'),
  theme('Lessons', 'o:lesson'),
  theme('Lifedrain', 'o:/loses? [^.]*life and you gain/'),
  theme('Lifegain', 'o:/whenever you gain life|you gain life|lifelink/'),
  theme('Looting', 'o:/draw (a|two) cards?, then discard/'),
  theme('Madness', 'keyword:madness or o:madness'),
  theme('Mill', 'o:/(target|each) (player|opponent) mills|opponents? mills?/'),
  theme('Modified Creatures', 'o:modified'),
  theme('Monarch', 'o:monarch'),
  theme('Morph', 'o:/face.down|morph|disguise|manifest|cloak/'),
  theme('Multicolor Matters', 'o:multicolored'),
  theme('Mutate', 'keyword:mutate or o:mutate'),
  theme('Myriad', 'keyword:myriad or o:myriad'),
  theme('Ninjutsu', 'keyword:ninjutsu or o:ninjutsu'),
  theme('Outlaws', 'o:outlaw'),
  theme('Party', 'o:"your party"'),
  theme('Pillow Fort', 'o:/can\'t attack you|attacks you or a planeswalker you control/'),
  theme('Pingers', 'o:/deals? 1 damage to (any target|target|each)/'),
  theme('Planeswalkers', 'o:planeswalker or t:planeswalker'),
  theme('Populate', 'o:populate'),
  theme('Proliferate', 'o:proliferate'),
  theme('Prowess', 'keyword:prowess or o:/whenever you cast a noncreature spell/'),
  theme('Rad Counters', 'o:"rad counter"'),
  theme('Ramp', 'o:/search your library for (a|up to \\w+) (basic )?lands?|play an additional land|put (a|up to \\w+) lands? cards? [^.]*onto the battlefield/'),
  theme('Reanimator', 'o:/return [^.]*cards? from (your|a) graveyard to the battlefield|put [^.]* from (a|your) graveyard onto the battlefield/'),
  theme('Sacrifice', 'o:/sacrifice (a|another) (creature|permanent|artifact)/'),
  theme('Sagas', 'o:/\\bsagas?\\b|lore counter/'),
  theme('Scry', 'o:scry'),
  theme('Self-Damage', 'o:/pay (\\d+|x) life|whenever you lose life/'),
  theme('Self-Discard', 'o:/whenever you discard|discard (a|one or more|any number of) cards?:/'),
  theme('Self-Mill', 'o:/\\bmill (a|one|two|three|four|five|x|\\d+) cards?|whenever you mill/'),
  theme('Snow', 'o:snow'),
  theme('Speed', 'o:"start your engines"'),
  theme('Spell Copy', 'o:/copy (target|that|it|the next)[^.]*(spell|instant|sorcery)/'),
  theme('Spellslinger', 'o:/instant (or|and) sorcery|noncreature spell/'),
  theme('Stax', 'o:/spells? (your )?opponents cast cost|don\'t untap|can\'t (cast|search|untap)/'),
  theme('Stompy', 'o:/power (4|5|6|7) or greater|greatest power|total power/'),
  theme('Storm', 'keyword:storm or o:/(second|third) spell|spells? you\'ve cast this turn/'),
  theme('Surveil', 'o:surveil'),
  theme('Suspend', 'keyword:suspend or o:"time counter"'),
  theme('Tap / Untap', 'o:/untap (target|another|all|each|up to)/'),
  theme('The Ring', 'o:"the ring tempts you"'),
  theme('Theft', 'o:/gain control of|you don\'t own|an opponent owns/'),
  theme('Tokens', 'o:/creates? [^.]*tokens?/'),
  theme('Topdeck', 'o:/top card of your library/'),
  theme('Toughness Matters', 'o:"equal to its toughness" or o:"toughness greater than"'),
  theme('Transform', 'o:transform'),
  theme('Treasure', 'o:treasure'),
  theme('Unblockable', 'o:/can\'t be blocked/'),
  theme('Vehicles', 'o:/\\bvehicles?\\b|\\bcrew/'),
  theme('Voltron', 'o:/equipped creature|enchanted creature|auras? (and|or) equipment|attached to/'),
  theme('Voting', 'o:/\\bvote/'),
  theme('Waterbending', 'o:waterbend'),
  theme('Wheels', 'o:/discards? (their|your) hand[^.]*draws?|each player [^.]*draws seven/'),
  theme('X Spells', 'm:{X} or o:/spells? with \\{x\\}|value of x/'),
];

/**
 * Tribos com os nomes do EDHREC (plural) e o tipo de criatura do Scryfall (singular).
 * A busca pega commanders do tipo ou que mencionam o tipo no texto.
 */
// prettier-ignore
const TRIBE_TYPES: [plural: string, type: string][] = [
  ['Advisors', 'Advisor'], ['Allies', 'Ally'], ['Angels', 'Angel'], ['Apes', 'Ape'], ['Archers', 'Archer'],
  ['Artificers', 'Artificer'], ['Assassins', 'Assassin'], ['Astartes', 'Astartes'], ['Atogs', 'Atog'], ['Avatars', 'Avatar'],
  ['Barbarians', 'Barbarian'], ['Bards', 'Bard'], ['Bats', 'Bat'], ['Bears', 'Bear'], ['Beasts', 'Beast'],
  ['Berserkers', 'Berserker'], ['Birds', 'Bird'], ['Cats', 'Cat'], ['Cephalids', 'Cephalid'], ['Clerics', 'Cleric'],
  ['Constructs', 'Construct'], ['Crabs', 'Crab'], ['Crocodiles', 'Crocodile'], ['Daleks', 'Dalek'], ['Demons', 'Demon'],
  ['Detectives', 'Detective'], ['Devils', 'Devil'], ['Dinosaurs', 'Dinosaur'], ['Dogs', 'Dog'], ['Dragons', 'Dragon'],
  ['Drakes', 'Drake'], ['Druids', 'Druid'], ['Dwarves', 'Dwarf'], ['Elders', 'Elder'], ['Eldrazi', 'Eldrazi'],
  ['Elementals', 'Elemental'], ['Elephants', 'Elephant'], ['Elves', 'Elf'], ['Faeries', 'Faerie'], ['Foxes', 'Fox'],
  ['Fractals', 'Fractal'], ['Frogs', 'Frog'], ['Fungi', 'Fungus'], ['Giants', 'Giant'], ['Gnomes', 'Gnome'],
  ['Goats', 'Goat'], ['Goblins', 'Goblin'], ['Gods', 'God'], ['Golems', 'Golem'], ['Gorgons', 'Gorgon'],
  ['Griffins', 'Griffin'], ['Halflings', 'Halfling'], ['Heroes', 'Hero'], ['Horrors', 'Horror'], ['Horses', 'Horse'],
  ['Humans', 'Human'], ['Hydras', 'Hydra'], ['Illusions', 'Illusion'], ['Insects', 'Insect'], ['Kithkin', 'Kithkin'],
  ['Knights', 'Knight'], ['Kor', 'Kor'], ['Lhurgoyfs', 'Lhurgoyf'], ['Lizards', 'Lizard'], ['Mercenaries', 'Mercenary'],
  ['Merfolk', 'Merfolk'], ['Mice', 'Mouse'], ['Minions', 'Minion'], ['Minotaurs', 'Minotaur'], ['Monkeys', 'Monkey'],
  ['Monks', 'Monk'], ['Moonfolk', 'Moonfolk'], ['Mounts', 'Mount'], ['Mutants', 'Mutant'], ['Myr', 'Myr'],
  ['Necrons', 'Necron'], ['Nightmares', 'Nightmare'], ['Ninjas', 'Ninja'], ['Nobles', 'Noble'], ['Ogres', 'Ogre'],
  ['Oozes', 'Ooze'], ['Orcs', 'Orc'], ['Otters', 'Otter'], ['Pegasi', 'Pegasus'], ['Phoenixes', 'Phoenix'],
  ['Phyrexians', 'Phyrexian'], ['Pirates', 'Pirate'], ['Plants', 'Plant'], ['Praetors', 'Praetor'], ['Rabbits', 'Rabbit'],
  ['Raccoons', 'Raccoon'], ['Rats', 'Rat'], ['Rebels', 'Rebel'], ['Robots', 'Robot'], ['Rogues', 'Rogue'],
  ['Samurai', 'Samurai'], ['Saprolings', 'Saproling'], ['Satyrs', 'Satyr'], ['Scarecrows', 'Scarecrow'], ['Shades', 'Shade'],
  ['Shamans', 'Shaman'], ['Shapeshifters', 'Shapeshifter'], ['Sharks', 'Shark'], ['Skeletons', 'Skeleton'], ['Slivers', 'Sliver'],
  ['Snakes', 'Snake'], ['Soldiers', 'Soldier'], ['Specters', 'Specter'], ['Sphinxes', 'Sphinx'], ['Spiders', 'Spider'],
  ['Spirits', 'Spirit'], ['Squirrels', 'Squirrel'], ['Symbiotes', 'Symbiote'], ['Thopters', 'Thopter'], ['Time Lords', 'Time Lord'],
  ['Treefolk', 'Treefolk'], ['Turtles', 'Turtle'], ['Tyranids', 'Tyranid'], ['Unicorns', 'Unicorn'], ['Vampires', 'Vampire'],
  ['Warriors', 'Warrior'], ['Werewolves', 'Werewolf'], ['Whales', 'Whale'], ['Wizards', 'Wizard'], ['Wolves', 'Wolf'],
  ['Wraiths', 'Wraith'], ['Wurms', 'Wurm'],
];

const esc = (s: string) => s.toLowerCase().replace(/ /g, '\\s');
export const TRIBES: ExploreTheme[] = TRIBE_TYPES.map(([plural, type]) => ({
  slug: slugify(plural),
  name: plural,
  kind: 'tribe',
  query: `t:"${type}" or o:/\\b(${esc(type)}|${esc(plural)})\\b/`,
}));
