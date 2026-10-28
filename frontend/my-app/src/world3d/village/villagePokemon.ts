/**
 * Les Pokémon de Clairbois, sans rendu. Chacun a un comportement : brouter dans l'enclos, porter des caisses à la
 * forge, suivre le garde, fuir le dresseur, dormir, se poser sur les lanternes et s'envoler, sauter hors du lac,
 * ou rôder la nuit sur la place. Ceux qui marchent occupent une case, comme les habitants ; les oiseaux, les
 * poissons et les spectres se déplacent librement.
 */
import type { Position } from '../../world/types'
import { BOURG_LANTERNS, BOURG_WELL } from '../../world/worldMap'
import { distance, findPath } from './pathfinding'
import type { Villager } from './villagers'
import { DISTRICT_POKEMON } from './districtLife'

export type Species = 'machoc' | 'wattouat' | 'caninos' | 'evoli' | 'ronflex' | 'roucool' | 'magicarpe' | 'fantominus'
export type Behaviour = 'worker' | 'graze' | 'follower' | 'timid' | 'sleeper' | 'perch' | 'swim' | 'haunt'
export type PokemonPose = 'idle' | 'walk' | 'run' | 'eat' | 'sleep' | 'carry' | 'fly' | 'jump' | 'float'
export interface Area { x: number; y: number; width: number; height: number }
/** Point de pose d'un oiseau, en cases (centre de case : x + 0,5) et en hauteur. */
export interface Perch { x: number; y: number; height: number }

export interface PokemonProfile {
    id: string
    species: Species
    /** Espèce côté serveur, pour les combats. */
    speciesKey: string
    name: string
    behaviour: Behaviour
    area?: Area
    spots?: Position[]
    /** Perchoirs du quartier : les oiseaux restent près des rues où ils vivent. */
    perches?: Perch[]
    /** Habitant suivi (compagnon). */
    follows?: string
    /** Sauvage : E à côté lance un combat. */
    wild?: true
    lore: string
}

const lantern = (x: number, y: number): Perch => ({x, y: y + 0.3, height: 1.98})
export const PERCHES: Perch[] = [
    ...BOURG_LANTERNS.map(([x, y]) => lantern(x, y)),
    {x: 23.5, y: 38.5, height: 1.62}, {...BOURG_WELL, height: 1.85},
    {x: 4, y: 50, height: 0.68}, {x: 7, y: 55, height: 0.68}, {x: 2, y: 52, height: 0.68},
]
const PASTURE: Area = {x: 3, y: 51, width: 5, height: 4}
const LAKE: Area = {x: 38, y: 45, width: 12, height: 7}
const MEADOW: Area = {x: 9, y: 20, width: 8, height: 6}

const sheep = (index: number): PokemonProfile => ({
    id: `wattouat-${index}`, species: 'wattouat', speciesKey: 'mareep', name: 'Wattouat', behaviour: 'graze', area: PASTURE,
    lore: 'Wattouat broute paisiblement ; sa laine crépite d’électricité statique.',
})
const bird = (index: number): PokemonProfile => ({
    id: `roucool-${index}`, species: 'roucool', speciesKey: 'pidgey', name: 'Roucool', behaviour: 'perch',
    lore: 'Roucool s’envole dès qu’on s’approche.',
})
const fish = (index: number): PokemonProfile => ({
    id: `magicarpe-${index}`, species: 'magicarpe', speciesKey: 'magikarp', name: 'Magicarpe', behaviour: 'swim', area: LAKE,
    lore: 'Magicarpe saute hors de l’eau… sans raison apparente.',
})

export const VILLAGE_POKEMON: PokemonProfile[] = [
    {
        id: 'machoc', species: 'machoc', speciesKey: 'machop', name: 'Machoc', behaviour: 'worker',
        spots: [{x: 9, y: 36}, {x: 15, y: 41}, {x: 6, y: 42}],
        lore: 'Machoc transporte des caisses de minerai pour Aldric. Il ne se fatigue jamais.',
    },
    sheep(1), sheep(2), sheep(3),
    {
        id: 'caninos', species: 'caninos', speciesKey: 'growlithe', name: 'Caninos', behaviour: 'follower', follows: 'bertrand',
        lore: 'Caninos ne quitte pas Bertrand d’une semelle. Il remue la queue.',
    },
    {
        id: 'evoli', species: 'evoli', speciesKey: 'eevee', name: 'Évoli', behaviour: 'timid', area: MEADOW, wild: true,
        lore: 'Un Évoli sauvage, très timide. Approche doucement…',
    },
    {
        id: 'ronflex', species: 'ronflex', speciesKey: 'snorlax', name: 'Ronflex', behaviour: 'sleeper', spots: [{x: 15, y: 29}],
        lore: 'Ronflex dort profondément. Rien ne semble pouvoir le réveiller.',
    },
    bird(1), bird(2), bird(3),
    fish(1), fish(2),
    {
        id: 'fantominus', species: 'fantominus', speciesKey: 'gastly', name: 'Fantominus', behaviour: 'haunt', wild: true,
        spots: [{x: 21, y: 37}, {x: 26, y: 37}, {x: 26, y: 41}, {x: 21, y: 41}],
        lore: 'Un Fantominus rôde sur la place endormie.',
    },
    ...DISTRICT_POKEMON,
]

/** Cases par seconde ; le temps passé à chaque étape ; la distance qui effraie un timide ou un oiseau. */
export const POKEMON_WALK = 1.3, POKEMON_RUN = 3.2, FLIGHT_SPEED = 5
export const FEAR_DISTANCE = 3, BIRD_FEAR = 2.5
const RETRY = 0.5
/** Heures de travail de Machoc et de sortie de Fantominus. */
export const WORK_HOURS = [6, 19], NIGHT_HOURS = [20, 5]

export interface VillagePokemon {
    profile: PokemonProfile
    /** Case occupée et case visée (Pokémon qui marchent). */
    tile: Position
    next: Position | null
    step: number
    path: Position[]
    /** Position libre (oiseaux, poissons, spectre), en cases, et hauteur au-dessus du sol. */
    x: number
    y: number
    height: number
    /** Cap en radians (0 : vers le sud, comme le dresseur). */
    heading: number
    pose: PokemonPose
    visible: boolean
    /** Compte à rebours de l'étape en cours (pause, saut, prochain envol). */
    timer: number
    spotIndex: number
    flight: { from: Perch; to: Perch; t: number; duration: number } | null
    perch: number
    /** Après un chemin bloqué, délai avant de recalculer : pas de recherche A* à chaque image. */
    retry: number
}

export interface PokemonWorld {
    player: Position
    passable: (tile: Position) => boolean
    villagers: Villager[]
    random: () => number
    /** Pluie, de 0 à 1 : sous l'averse, Roucool s'abrite. */
    rain?: number
    /** Cases de terre noyées assez profond pour nager : Magicarpe y saute pendant la crue. */
    pools?: Position[]
    /** Hors de ce rayon, aucun déplacement ni recherche de chemin. Le comportement reprend à l'approche. */
    activityRadius?: number
}

const same = (a: Position, b: Position) => a.x === b.x && a.y === b.y
const inArea = (area: Area, {x, y}: Position) => x >= area.x && x < area.x + area.width && y >= area.y && y < area.y + area.height
const isNight = (hour: number) => hour >= NIGHT_HOURS[0] || hour < NIGHT_HOURS[1]
/** Les compagnons ne bloquent personne : ils collent à leur maître, comme Pikachu au dresseur. */
const blocks = (pokemon: VillagePokemon) => pokemon.visible && pokemon.profile.behaviour !== 'follower' && walks(pokemon.profile.behaviour)
const walks = (behaviour: Behaviour) => behaviour === 'worker' || behaviour === 'graze' || behaviour === 'follower' || behaviour === 'timid' || behaviour === 'sleeper'

export function createVillagePokemon(profiles: PokemonProfile[], random: () => number): VillagePokemon[] {
    const taken = new Set<string>()
    return profiles.map((profile, index) => {
        let start: Position = profile.spots?.[0] ?? {x: 0, y: 0}
        if (profile.area) {
            // Départ dans sa zone, sur une case libre.
            const {x, y, width, height} = profile.area
            for (let attempt = 0; attempt < 50; attempt++) {
                start = {x: x + Math.floor(random() * width), y: y + Math.floor(random() * height)}
                if (!taken.has(`${start.x},${start.y}`)) break
            }
        }
        taken.add(`${start.x},${start.y}`)
        const perches = profile.perches ?? PERCHES
        const perch = profile.behaviour === 'perch' ? (index * 3) % perches.length : 0
        const at = profile.behaviour === 'perch' ? perches[perch] : {...start, height: 0}
        return {
            profile, tile: {...start}, next: null, step: 0, path: [], x: at.x, y: at.y, height: at.height,
            heading: random() * Math.PI * 2, pose: 'idle', visible: profile.behaviour !== 'swim', timer: random() * 4, spotIndex: 0, flight: null, perch, retry: 0,
        }
    })
}

/** Position continue, en cases (centre de case : x + 0,5). */
export function pokemonPosition(pokemon: VillagePokemon): Position {
    if (!walks(pokemon.profile.behaviour)) return {x: pokemon.x, y: pokemon.y}
    if (!pokemon.next) return pokemon.tile
    return {
        x: pokemon.tile.x + (pokemon.next.x - pokemon.tile.x) * pokemon.step,
        y: pokemon.tile.y + (pokemon.next.y - pokemon.tile.y) * pokemon.step,
    }
}

/** Pokémon qui marche sur cette case (ou y entre) : le dresseur et les habitants le contournent. */
export function pokemonAt(list: VillagePokemon[], tile: Position) {
    return list.find((pokemon) => blocks(pokemon) && (same(pokemon.tile, tile) || (pokemon.next !== null && same(pokemon.next, tile))))
}

/** Pokémon visible à portée de main du dresseur (case voisine, ou moins d'une case et demie pour ceux qui volent). */
export function pokemonNear(list: VillagePokemon[], player: Position) {
    const reachable = list.filter((pokemon) => {
        if (!pokemon.visible || pokemon.flight) return false
        if (walks(pokemon.profile.behaviour)) return !pokemon.next && distance(pokemon.tile, player) === 1
        return Math.hypot(pokemon.x - player.x, pokemon.y - player.y) < 1.5 && pokemon.height < 2.2
    })
    const away = (pokemon: VillagePokemon) => {
        const at = pokemonPosition(pokemon)
        return Math.hypot(at.x - player.x, at.y - player.y)
    }
    // Le plus proche répond, s'il y en a plusieurs.
    return reachable.sort((a, b) => away(a) - away(b))[0]
}

export function updateVillagePokemon(list: VillagePokemon[], hour: number, seconds: number, world: PokemonWorld) {
    const villagerOn = (tile: Position) => world.villagers.some((villager) => !villager.inside
        && (same(villager.tile, tile) || (villager.next !== null && same(villager.next, tile))))
    const occupied = (tile: Position, self: VillagePokemon) => same(tile, world.player) || villagerOn(tile)
        || list.some((other) => other !== self && blocks(other) && (same(other.tile, tile) || (other.next !== null && same(other.next, tile))))

    /** Avance le pas en cours ; renvoie vrai tant que le Pokémon est entre deux cases. */
    function advance(pokemon: VillagePokemon, speed: number) {
        if (!pokemon.next) return false
        pokemon.step += seconds * speed
        if (pokemon.step < 1) return true
        pokemon.tile = pokemon.next
        pokemon.next = null
        pokemon.step = 0
        return false
    }

    /** Un pas vers `goal` par le plus court chemin dans `allowed` ; faux si arrivé ou bloqué. */
    function stepToward(pokemon: VillagePokemon, goal: Position, allowed: (tile: Position) => boolean) {
        if (same(pokemon.tile, goal) || pokemon.retry > 0) return false
        const last = pokemon.path[pokemon.path.length - 1]
        if (!last || !same(last, goal)) pokemon.path = findPath(pokemon.tile, goal, allowed) ?? []
        const next = pokemon.path[0]
        if (!next || occupied(next, pokemon)) {
            pokemon.path = []
            pokemon.retry = RETRY
            return false
        }
        pokemon.path.shift()
        pokemon.next = next
        pokemon.step = 0
        pokemon.heading = Math.atan2(next.x - pokemon.tile.x, next.y - pokemon.tile.y)
        return true
    }

    /** Case libre au hasard dans la zone. */
    function wander(pokemon: VillagePokemon, area: Area) {
        for (let attempt = 0; attempt < 6; attempt++) {
            const goal = {x: area.x + Math.floor(world.random() * area.width), y: area.y + Math.floor(world.random() * area.height)}
            if (world.passable(goal) && !occupied(goal, pokemon)) return goal
        }
        return null
    }

    for (const pokemon of list) {
        const {behaviour, area, spots} = pokemon.profile
        const at = pokemonPosition(pokemon)
        const master = behaviour === 'follower' ? world.villagers.find((villager) => villager.profile.id === pokemon.profile.follows) : undefined
        if (distance(at, world.player) > (world.activityRadius ?? Infinity)
            && (!master || distance(master.tile, world.player) > (world.activityRadius ?? Infinity))) continue
        pokemon.timer -= seconds
        pokemon.retry -= seconds
        const allowed = (tile: Position) => world.passable(tile) && (!area || inArea(area, tile))
        switch (behaviour) {
            case 'sleeper':
                pokemon.pose = 'sleep'
                break
            case 'worker': {
                const working = hour >= WORK_HOURS[0] && hour < WORK_HOURS[1]
                if (advance(pokemon, POKEMON_WALK)) break
                const goal = working ? spots![pokemon.spotIndex % 2] : spots![2]
                if (same(pokemon.tile, goal)) {
                    pokemon.pose = working ? 'idle' : 'sleep'
                    if (working && pokemon.timer <= 0) {
                        pokemon.spotIndex++
                        pokemon.timer = 3
                    }
                } else pokemon.pose = stepToward(pokemon, goal, world.passable) ? (working && pokemon.spotIndex % 2 === 0 ? 'carry' : 'walk') : 'idle'
                break
            }
            case 'graze': {
                if (advance(pokemon, POKEMON_WALK)) break
                if (isNight(hour)) {
                    pokemon.pose = 'sleep'
                    break
                }
                if (pokemon.timer > 0) {
                    pokemon.pose = 'eat'
                    break
                }
                const goal = pokemon.path.length ? pokemon.path[pokemon.path.length - 1] : wander(pokemon, area!)
                if (goal && stepToward(pokemon, goal, allowed)) pokemon.pose = 'walk'
                else {
                    pokemon.pose = 'eat'
                    pokemon.timer = 3 + world.random() * 6
                }
                break
            }
            case 'timid': {
                const scared = distance(pokemon.tile, world.player) <= FEAR_DISTANCE
                if (advance(pokemon, scared ? POKEMON_RUN : POKEMON_WALK)) break
                if (scared) {
                    // Fuite : la case voisine la plus éloignée du dresseur.
                    const options = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({x: pokemon.tile.x + dx, y: pokemon.tile.y + dy}))
                        .filter((tile) => allowed(tile) && !occupied(tile, pokemon) && distance(tile, world.player) > distance(pokemon.tile, world.player))
                        .sort((a, b) => distance(b, world.player) - distance(a, world.player))
                    pokemon.path = []
                    pokemon.pose = options[0] && stepToward(pokemon, options[0], allowed) ? 'run' : 'idle'
                    break
                }
                if (pokemon.timer > 0) {
                    pokemon.pose = 'idle'
                    break
                }
                const goal = pokemon.path.length ? pokemon.path[pokemon.path.length - 1] : wander(pokemon, area!)
                if (goal && stepToward(pokemon, goal, allowed)) pokemon.pose = 'walk'
                else {
                    pokemon.pose = 'idle'
                    pokemon.timer = 2 + world.random() * 4
                }
                break
            }
            case 'follower': {
                const master = world.villagers.find((villager) => villager.profile.id === pokemon.profile.follows)
                if (!master || master.inside) {
                    pokemon.visible = false
                    pokemon.next = null
                    if (master) pokemon.tile = {...master.tile}
                    break
                }
                pokemon.visible = true
                if (advance(pokemon, POKEMON_RUN * 0.75)) break
                const around = [[0, -1], [1, 0], [0, 1], [-1, 0]].map(([dx, dy]) => ({x: master.tile.x + dx, y: master.tile.y + dy}))
                    .filter((tile) => world.passable(tile) && !occupied(tile, pokemon))
                    .sort((a, b) => distance(a, pokemon.tile) - distance(b, pokemon.tile))
                // Trop loin (il vient de sortir de chez lui avec son maître) : il le rejoint d'un bond.
                if (distance(pokemon.tile, master.tile) > 6 && around[0]) {
                    pokemon.tile = around[0]
                    pokemon.path = []
                }
                if (distance(pokemon.tile, master.tile) <= 1) {
                    pokemon.pose = 'idle'
                    if (!same(pokemon.tile, master.tile)) pokemon.heading = Math.atan2(master.tile.x - pokemon.tile.x, master.tile.y - pokemon.tile.y)
                    break
                }
                pokemon.pose = around[0] && stepToward(pokemon, around[0], world.passable) ? 'run' : 'idle'
                break
            }
            case 'perch':
                updateBird(pokemon, world, list, seconds)
                break
            case 'swim':
                updateFish(pokemon, world, seconds)
                break
            case 'haunt':
                updateGhost(pokemon, hour, seconds)
                break
        }
    }
}

function updateBird(bird: VillagePokemon, world: PokemonWorld, list: VillagePokemon[], seconds: number) {
    // Sous la pluie, il quitte son perchoir pour un abri (invisible) et y revient quand elle cesse.
    bird.visible = (world.rain ?? 0) < 0.3
    if (!bird.visible) {
        if (bird.flight) {
            ({x: bird.x, y: bird.y, height: bird.height} = bird.flight.to)
            bird.flight = null
        }
        return
    }
    if (bird.flight) {
        const flight = bird.flight
        flight.t = Math.min(1, flight.t + seconds / flight.duration)
        bird.x = flight.from.x + (flight.to.x - flight.from.x) * flight.t
        bird.y = flight.from.y + (flight.to.y - flight.from.y) * flight.t
        // Arc de vol : il monte au-dessus des toits puis redescend se poser.
        bird.height = flight.from.height + (flight.to.height - flight.from.height) * flight.t + Math.sin(Math.PI * flight.t) * 3
        bird.pose = 'fly'
        if (flight.t >= 1) {
            bird.flight = null
            bird.timer = 20 + world.random() * 25
        }
        return
    }
    bird.pose = 'idle'
    const scared = Math.hypot(bird.x - world.player.x, bird.y - world.player.y) < BIRD_FEAR
    if (!scared && bird.timer > 0) return
    // Nouveau perchoir : libre, et loin du dresseur s'il fuit.
    const perches = bird.profile.perches ?? PERCHES
    const taken = new Set(list.filter((other) => other !== bird && other.profile.behaviour === 'perch'
        && other.profile.perches === bird.profile.perches).map((other) => other.perch))
    const choices = perches.map((_, index) => index).filter((index) => index !== bird.perch && !taken.has(index)
        && Math.hypot(perches[index].x - world.player.x, perches[index].y - world.player.y) > 5)
    if (!choices.length) return
    const target = choices[Math.floor(world.random() * choices.length)]
    const from = {x: bird.x, y: bird.y, height: bird.height}, to = perches[target]
    bird.perch = target
    bird.heading = Math.atan2(to.x - from.x, to.y - from.y)
    bird.flight = {from, to, t: 0, duration: Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) / FLIGHT_SPEED)}
}

/** Magicarpe reste sous l'eau, puis bondit : un arc d'une seconde, visible au-dessus de la surface. */
function updateFish(fish: VillagePokemon, world: PokemonWorld, seconds: number) {
    if (fish.pose === 'jump') {
        const t = 1 - fish.timer / 1.1
        fish.height = Math.sin(Math.PI * Math.min(1, t)) * 0.9 - 0.2
        fish.x += Math.sin(fish.heading) * seconds * 1.2
        fish.y += Math.cos(fish.heading) * seconds * 1.2
        if (fish.timer > 0) return
        fish.visible = false
        fish.pose = 'idle'
        fish.timer = 3 + world.random() * 6
        return
    }
    if (fish.timer > 0) return
    const area = fish.profile.area!
    const pools = world.pools ?? []
    // Pendant la crue, un saut sur deux a lieu dans les champs noyés.
    if (pools.length && world.random() < 0.5) {
        const pool = pools[Math.floor(world.random() * pools.length)]
        fish.x = pool.x + (world.random() - 0.5) * 0.6
        fish.y = pool.y + (world.random() - 0.5) * 0.6
    } else {
        fish.x = area.x + world.random() * area.width
        fish.y = area.y + world.random() * area.height
    }
    fish.heading = world.random() * Math.PI * 2
    fish.visible = true
    fish.pose = 'jump'
    fish.timer = 1.1
}

/** Fantominus flotte la nuit d'un coin de la place à l'autre ; le jour, il disparaît. */
function updateGhost(ghost: VillagePokemon, hour: number, seconds: number) {
    ghost.visible = isNight(hour)
    if (!ghost.visible) return
    const spots = ghost.profile.spots!
    const goal = spots[ghost.spotIndex % spots.length]
    const dx = goal.x - ghost.x, dy = goal.y - ghost.y, length = Math.hypot(dx, dy)
    ghost.pose = 'float'
    ghost.height = 1
    if (length < 0.05) {
        if (ghost.timer <= 0) {
            ghost.spotIndex++
            ghost.timer = 4
        }
        return
    }
    const travel = Math.min(length, seconds * 0.8)
    ghost.x += dx / length * travel
    ghost.y += dy / length * travel
    ghost.heading = Math.atan2(dx, dy)
}
