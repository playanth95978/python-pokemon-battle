/** Les rues de liaison sont habitées ; les routines restent locales pour borner les recherches de chemin. */
import { buildingEntrance } from '../../world/buildings'
import { CITY_STREETS, type CityStreet } from '../../world/cityLayout'
import { tileAt, WORLD_MAP } from '../../world/worldMap'
import type { Position } from '../../world/types'
import type { Profile, Spot } from './villagers'
import { DISTRICT_VILLAGERS } from './districtLife'

const NAMES = ['Nora', 'Basile', 'Alma', 'Ruben', 'Céleste', 'Abel', 'Diane', 'Simon', 'Lise', 'Tom',
    'Manon', 'Octave', 'Salomé', 'Léandre', 'Clara', 'Marius', 'Lila', 'Robin', 'Anna', 'Sacha',
    'Gaëlle', 'Adrien', 'Naïma', 'Victor', 'Flora', 'Eden', 'Pauline', 'Hugo', 'Louise', 'Arthur',
    'Ambre', 'Nils', 'Romy', 'Tristan', 'Aurore', 'Martin', 'Elsa', 'Côme', 'Iris', 'Raphaël',
    'Fanny', 'Malo', 'Yuna', 'Axel', 'Estelle']
const JOBS: Record<string, string[]> = {
    ponts: ['aubergiste', 'livreur'], bourg: ['boulanger', 'couturière'], artisans: ['potier', 'menuisier', 'apprentie'],
    port: ['pêcheur', 'dockeuse', 'marchand de filets'], fermes: ['meunier', 'maraîchère'],
    vergers: ['jardinière', 'cueilleur', 'herboriste'], halles: ['marchande', 'messager', 'dresseuse'],
}

function onStreet(street: CityStreet, home: Position, offset = 0): Spot {
    const start = street.axis === 'x' ? street.x : street.y
    const along = Math.max(start, Math.min(street.end, (street.axis === 'x' ? home.x : home.y) + offset))
    return street.axis === 'x' ? {x: along, y: street.y, facing: offset < 0 ? 'left' : 'right'}
        : {x: street.x, y: along, facing: offset < 0 ? 'up' : 'down'}
}

function localRoute(home: Spot, occupiedStops: Set<string>): Spot[] {
    const street = [...CITY_STREETS].sort((a, b) => {
        const pa = onStreet(a, home), pb = onStreet(b, home)
        return Math.abs(pa.x - home.x) + Math.abs(pa.y - home.y) - Math.abs(pb.x - home.x) - Math.abs(pb.y - home.y)
    })[0]
    const points: Spot[] = []
    for (const offset of [-5, 0, 5, -3, 3, -7, 7]) {
        const position = onStreet(street, home, offset), key = `${position.x},${position.y}`
        if (tileAt(WORLD_MAP, position) !== 'path' || occupiedStops.has(key)
            || (position.x < 42 && position.y < 57)) continue
        occupiedStops.add(key)
        points.push(position)
        if (points.length === 3) break
    }
    return points.length ? points : [home]
}

function resident(building: (typeof WORLD_MAP.buildings)[number], index: number, occupiedStops: Set<string>): Profile {
    const home: Spot = {...buildingEntrance(building), facing: building.facing ?? 'down'}
    const route = localRoute(home, occupiedStops), jobs = JOBS[building.district!], child = index % 10 === 9
    return {
        id: `city-${index}`, name: NAMES[index % NAMES.length], job: child ? 'enfant' : jobs[index % jobs.length], home,
        ...(child ? {child: true} : {}),
        outfit: {shirt: [0x537a87, 0x996b54, 0x817293, 0x7d8b55, 0xb08b4d][index % 5],
            pants: 0x37414b, hair: [0x3e2a23, 0xb99458, 0x8d593e, 0xc4bdb0][index % 4],
            skin: [0xe2b994, 0xb98563, 0x9b6d4f][index % 3], accent: 0xc4ac7a},
        schedule: [
            {from: child ? 9 : 7, activity: child ? 'play' : 'work', spots: route},
            {from: 12, activity: 'chat', spots: [route[Math.floor(route.length / 2)]]},
            {from: 14, activity: 'work', spots: [home]},
            {from: 17, activity: child ? 'play' : 'idle', spots: [...route].reverse()},
            {from: child ? 20 : 22, activity: 'sleep', spots: []},
        ],
        lines: [`J’habite ${building.name}. On peut désormais traverser les quartiers par les petites rues.`,
            building.district === 'port' ? 'Les livraisons arrivent par le quai. Attention aux Magicarpe !'
                : building.district === 'vergers' ? 'Je préfère les jardins au bruit des ateliers.'
                : child ? 'Je fais la course avec les Roucool jusqu’au prochain carrefour !'
                : 'Le marché attire du monde, mais les ruelles sont plus tranquilles.'],
    }
}

function createCityResidents(): Profile[] {
    // Deux habitants n'ont jamais le même rendez-vous, même au chargement en milieu de journée.
    const occupiedStops = new Set([
        ...WORLD_MAP.buildings.map(buildingEntrance),
        ...DISTRICT_VILLAGERS.flatMap((profile) => profile.schedule.flatMap((shift) => shift.spots)),
    ].map(({x, y}) => `${x},${y}`))
    return WORLD_MAP.buildings.filter((building) => building.district).map((building, index) => resident(building, index, occupiedStops))
}

export const CITY_VILLAGERS = createCityResidents()
