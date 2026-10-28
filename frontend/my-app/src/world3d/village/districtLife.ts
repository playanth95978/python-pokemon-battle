/** Habitants des nouveaux quartiers : mêmes métiers et rythmes de vie, sans dupliquer des modèles 3D. */
import type { Position } from '../../world/types'
import { CLAIRBOIS_DISTRICTS } from '../../world/worldMap'
import type { Profile, Spot } from './villagers'
import type { Perch, PokemonProfile } from './villagePokemon'

export const LIFE_DISTRICTS = CLAIRBOIS_DISTRICTS.map(({id, name, x, y}) => ({id, name: name.toLocaleLowerCase('fr-FR'), x, y}))

const NAMES = [
    ['Hector', 'Agathe', 'Lucien', 'Jeanne', 'Armand', 'Solange', 'Émile', 'Alice', 'Bastien', 'Jules', 'Zoé'],
    ['Marin', 'Océane', 'Yann', 'Maëlle', 'Corentin', 'Élise', 'Gustave', 'Ninon', 'Ronan', 'Noé', 'Lou'],
    ['Éloi', 'Adèle', 'Félix', 'Aline', 'Théodore', 'Suzanne', 'Marcel', 'Odette', 'Clément', 'Milo', 'Inès'],
    ['Antonin', 'Camille', 'Oscar', 'Lucie', 'Gabin', 'Hélène', 'Louis', 'Violette', 'Arthur', 'Léon', 'Mia'],
]
const JOBS = ['artisan', 'marchande', 'tisserand', 'fermière', 'garde', 'herboriste', 'ancien', 'porteuse d’eau', 'menuisier', 'enfant', 'enfant']
const HOMES = [[-11, -7], [-3, -7], [7, -7], [-11, 11], [7, 11], [15, 11], [15, -4]]
const POSTS = [[-3, -2], [-1, -2], [1, -2], [3, -2], [-3, 2], [-1, 2], [1, 2], [-3, 4], [-1, 4], [1, 4], [3, 4]]
const SHIRTS = [0x795b42, 0xa14b59, 0x426686, 0x708344, 0x697785, 0x77704e, 0x71675e, 0x428587, 0x947448, 0xc99c48, 0xa66c95]

export const DISTRICT_VILLAGERS: Profile[] = LIFE_DISTRICTS.flatMap((district, districtIndex) => {
    const at = ([x, y]: number[]): Spot => ({x: district.x + x, y: district.y + y, facing: 'down'})
    return JOBS.map((job, index): Profile => {
        const post = at(POSTS[index])
        const child = index >= 9
        return {
            id: `${district.id}-${index}`, name: NAMES[districtIndex][index], job,
            home: at(HOMES[index % HOMES.length]), ...(child ? {child: true} : {}),
            outfit: {shirt: SHIRTS[(index + districtIndex) % SHIRTS.length], pants: 0x39414c, hair: index === 6 ? 0xc5c2b9 : 0x453026,
                skin: [0xd6a57e, 0x9b6d4f, 0xe2b994, 0xb98563][(index + districtIndex) % 4], accent: 0xc4ac7a},
            schedule: [
                {from: child ? 9 : 6, activity: child ? 'play' : index === 0 ? 'hammer' : index === 6 ? 'idle' : 'work',
                    spots: [post, {...post, y: post.y + 1, facing: 'up'}]},
                {from: 12, activity: 'chat', spots: [post]},
                {from: 13, activity: child ? 'play' : 'work', spots: [post, {...post, y: post.y + 1, facing: 'up'}]},
                {from: 18, activity: 'idle', spots: [post]},
                {from: child ? 19 : 21, activity: 'sleep', spots: []},
            ],
            lines: [
                `Bienvenue dans le ${district.name} ! Je m’appelle ${NAMES[districtIndex][index]}.`,
                child ? 'Les Roucool nous regardent jouer depuis les lanternes !'
                    : index === 4 ? 'Je veille sur les chemins. Le vieux château est toujours au sud du bourg.'
                    : `Ici aussi, les Pokémon nous aident au travail. Le ${district.name} ne dort jamais bien longtemps.`,
                districtIndex === 1 ? 'Les Magicarpe bondissent dans l’étang, surtout après la pluie.'
                    : districtIndex === 2 ? 'Les Wattouat ont encore trouvé l’herbe la plus tendre.'
                    : districtIndex === 3 ? 'Les baies du verger seront bientôt mûres.' : 'Les ateliers préparent les étals du prochain marché.',
            ],
        }
    })
})

export const DISTRICT_POKEMON: PokemonProfile[] = LIFE_DISTRICTS.flatMap((district) => {
    const at = (x: number, y: number): Position => ({x: district.x + x, y: district.y + y})
    const perches: Perch[] = [[-6, -3], [6, -3], [-6, 3], [6, 3]].map(([x, y]) => ({...at(x, y + 0.3), height: 1.98}))
    const animal = (species: PokemonProfile['species'], speciesKey: string, name: string, behaviour: PokemonProfile['behaviour'], index = 0): PokemonProfile => ({
        id: `${district.id}-${species}-${index}`, species, speciesKey, name, behaviour,
        lore: `${name} fait partie de la vie du ${district.name}.`,
    })
    return [
        {...animal('machoc', 'machop', 'Machoc', 'worker'), spots: [at(-5, -4), at(-4, -4), at(-10, -6)]},
        ...[1, 2, 3].map((index) => ({...animal('wattouat', 'mareep', 'Wattouat', 'graze', index), area: {...at(14, 14), width: 5, height: 4}})),
        {...animal('caninos', 'growlithe', 'Caninos', 'follower'), follows: `${district.id}-4`},
        {...animal('evoli', 'eevee', 'Évoli', 'timid'), area: {...at(-8, 15), width: 7, height: 5}, wild: true as const},
        {...animal('ronflex', 'snorlax', 'Ronflex', 'sleeper'), spots: [at(-8, 4)]},
        ...[1, 2, 3].map((index) => ({...animal('roucool', 'pidgey', 'Roucool', 'perch', index), perches})),
        ...[1, 2].map((index) => district.id === 'port'
            ? {...animal('magicarpe', 'magikarp', 'Magicarpe', 'swim', index), area: {x: 120, y: 55, width: 6, height: 5}}
            : {...animal('wattouat', 'mareep', 'Wattouat', 'graze', index + 3), area: {...at(14, 14), width: 5, height: 4}}),
        {...animal('fantominus', 'gastly', 'Fantominus', 'haunt'), spots: [at(-5, -5), at(5, -5), at(5, 5), at(-5, 5)], wild: true as const},
    ]
})
