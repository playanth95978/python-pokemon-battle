/**
 * Vélo de ville fait de primitives (aucun modèle extrait des jeux) : cadre en acier laqué, roues à rayons croisés,
 * transmission dont chaque maillon de chaîne avance avec le pédalier, fourche qui braque, garde-boue, éclairage.
 * Le pilote s'y pose par cinématique inverse : bassin sur la selle, pieds sur les pédales, mains au guidon.
 *
 * Repère du vélo : origine au sol entre les deux roues, +z vers l'avant, +x à gauche du pilote (celui du dresseur).
 */
import * as THREE from 'three'

/** Rayon de roue (24 pouces, pneu compris) et empattement, en mètres : une case du monde vaut un mètre. */
export const WHEEL_RADIUS = 0.31, WHEELBASE = 0.98
/** Rayons du plateau et du pignon, longueur des manivelles. */
export const CHAINRING = 0.1, COG = 0.035, CRANK = 0.15
/** Développement : tours de roue pour un tour de pédalier. */
export const GEAR = CHAINRING / COG
/** Pas d'une chaîne de vélo (un demi-pouce). */
const CHAIN_PITCH = 0.0127
const GRAVITY = 9.81, MAX_BANK = 0.45
/** Côté transmission : à droite du pilote. */
const DRIVE_SIDE = -0.055

/** Rotation du pédalier (rad) pour `distance` mètres parcourus. */
export const crankTurn = (distance: number) => distance / WHEEL_RADIUS / GEAR

/**
 * Inclinaison d'équilibre dans un virage, en rotation autour de l'axe avant : tan(angle) = v·ω / g. Un lacet positif
 * tourne vers la gauche du pilote ; le vélo penche alors à gauche, c'est-à-dire en rotation négative.
 */
export function bankAngle(speed: number, yawRate: number) {
    return THREE.MathUtils.clamp(-Math.atan(speed * yawRate / GRAVITY), -MAX_BANK, MAX_BANK)
}

export interface SidePoint { z: number; y: number }

export interface ChainPath {
    length: number
    /** Point de la chaîne à l'abscisse `s` (repliée sur la longueur), dans le plan de la transmission. */
    at(s: number): SidePoint
}

/**
 * Chaîne tendue autour du pignon (arrière) et du plateau : deux brins tangents aux deux cercles et deux arcs. Le
 * parcours suit le sens de la marche : le brin du haut file du pignon vers le plateau, qui le tire.
 */
export function chainPath(cog: SidePoint, cogRadius: number, ring: SidePoint, ringRadius: number): ChainPath {
    const dz = ring.z - cog.z, dy = ring.y - cog.y, distance = Math.hypot(dz, dy)
    const uz = dz / distance, uy = dy / distance
    // Normale commune aux tangentes extérieures : u·n = (r_pignon − r_plateau) / distance.
    const cos = (cogRadius - ringRadius) / distance, sin = Math.sqrt(1 - cos * cos)
    const top = {z: uz * cos - uy * sin, y: uy * cos + uz * sin}
    const bottom = {z: uz * cos + uy * sin, y: uy * cos - uz * sin}
    const topAngle = Math.atan2(top.y, top.z), bottomAngle = Math.atan2(bottom.y, bottom.z)
    const turn = (angle: number) => THREE.MathUtils.euclideanModulo(angle, Math.PI * 2)
    const on = (center: SidePoint, radius: number, angle: number) => ({z: center.z + radius * Math.cos(angle), y: center.y + radius * Math.sin(angle)})
    const line = (from: SidePoint, to: SidePoint) => ({
        length: Math.hypot(to.z - from.z, to.y - from.y),
        at: (t: number) => ({z: from.z + (to.z - from.z) * t, y: from.y + (to.y - from.y) * t}),
    })
    // Les deux arcs tournent dans le sens horaire (vu de droite, avant à droite) : celui des roues qui avancent.
    const arc = (center: SidePoint, radius: number, from: number, sweep: number) => ({
        length: radius * sweep,
        at: (t: number) => on(center, radius, from - sweep * t),
    })
    const segments = [
        arc(ring, ringRadius, topAngle, turn(topAngle - bottomAngle)),
        line(on(ring, ringRadius, bottomAngle), on(cog, cogRadius, bottomAngle)),
        arc(cog, cogRadius, bottomAngle, turn(bottomAngle - topAngle)),
        line(on(cog, cogRadius, topAngle), on(ring, ringRadius, topAngle)),
    ]
    const length = segments.reduce((sum, segment) => sum + segment.length, 0)
    return {
        length,
        at(s) {
            let rest = THREE.MathUtils.euclideanModulo(s, length)
            for (const segment of segments) {
                if (rest <= segment.length) return segment.at(rest / segment.length)
                rest -= segment.length
            }
            return segments[0].at(0)
        },
    }
}

const UP = new THREE.Vector3(0, 1, 0)
const point = (z: number, y: number, x = 0) => new THREE.Vector3(x, y, z)

/** Tube droit d'un point à l'autre (rayon `radius` au départ, `radiusTo` à l'arrivée). */
function tube(from: THREE.Vector3, to: THREE.Vector3, radius: number, material: THREE.Material, radiusTo = radius) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTo, radius, from.distanceTo(to), 14), material)
    mesh.position.copy(from).lerp(to, 0.5)
    mesh.quaternion.setFromUnitVectors(UP, to.clone().sub(from).normalize())
    mesh.castShadow = true
    return mesh
}

export type Bicycle = ReturnType<typeof createBicycle>

export function createBicycle() {
    const group = new THREE.Group()
    group.name = 'bicycle'
    // Laque rouge vernie, chromes, alu brossé, caoutchouc et plastique noirs.
    const paint = new THREE.MeshPhysicalMaterial({color: 0xa3161f, metalness: 0.45, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06})
    const chrome = new THREE.MeshStandardMaterial({color: 0xe8ebee, metalness: 1, roughness: 0.12})
    const alloy = new THREE.MeshStandardMaterial({color: 0xb9bec4, metalness: 0.9, roughness: 0.32})
    const steel = new THREE.MeshStandardMaterial({color: 0x55595e, metalness: 0.85, roughness: 0.4})
    const rubber = new THREE.MeshStandardMaterial({color: 0x1b1b1c, roughness: 0.93})
    const plastic = new THREE.MeshStandardMaterial({color: 0x222326, roughness: 0.55})
    const leather = new THREE.MeshStandardMaterial({color: 0x3a2618, roughness: 0.6})

    const rearAxle = point(-WHEELBASE / 2, WHEEL_RADIUS), frontAxle = point(WHEELBASE / 2, WHEEL_RADIUS)
    const bottomBracket = point(-0.06, 0.27), seatCluster = point(-0.15, 0.68)
    const headTop = point(0.36, 0.76), headBottom = point(0.4, 0.6)

    // Cadre en diamant : tube supérieur, diagonal, de selle, de direction, puis haubans et bases doublés.
    group.add(
        tube(headTop.clone().lerp(headBottom, 0.15), seatCluster, 0.016, paint),
        tube(headBottom.clone().lerp(headTop, 0.2), bottomBracket, 0.02, paint, 0.022),
        tube(bottomBracket, seatCluster.clone().add(point(-0.005, 0.03)), 0.017, paint),
        tube(headBottom.clone().add(point(0.004, -0.02)), headTop.clone().add(point(-0.004, 0.02)), 0.022, paint),
        new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.075, 18).rotateZ(Math.PI / 2), paint).translateY(bottomBracket.y).translateZ(bottomBracket.z),
    )
    for (const side of [-1, 1]) {
        const dropout = rearAxle.clone().setX(side * 0.062)
        group.add(
            tube(dropout, bottomBracket.clone().setX(side * 0.028), 0.009, paint, 0.011),
            tube(dropout, seatCluster.clone().add(point(-0.01, -0.03)).setX(side * 0.018), 0.008, paint),
        )
    }

    // Selle et tige : la hauteur se règle sur la jambe du pilote (fitSaddle).
    const seatTube = seatCluster.clone().sub(bottomBracket).normalize()
    const seatPost = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1, 12), chrome)
    seatPost.castShadow = true
    const saddle = new THREE.Group()
    const saddleBody = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), leather)
    saddleBody.scale.set(0.085, 0.035, 0.11)
    saddleBody.position.z = -0.02
    const saddleNose = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), leather)
    saddleNose.scale.set(0.035, 0.03, 0.11)
    saddleNose.position.z = 0.07
    const rails = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.012, 0.14), steel)
    rails.position.y = -0.01
    saddleBody.castShadow = saddleNose.castShadow = true
    // Catadioptre rouge à l'arrière de la selle.
    const reflector = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.025, 0.008), new THREE.MeshStandardMaterial({color: 0xc0101a, emissive: 0x500000, roughness: 0.2}))
    reflector.position.set(0, -0.005, -0.135)
    const seat = new THREE.Object3D()
    seat.position.set(0, 0.03, -0.03)
    saddle.add(saddleBody, saddleNose, rails, reflector, seat)
    group.add(seatPost, saddle)
    function fitSaddle(top: number) {
        // La selle glisse le long du tube de selle.
        const along = (top - 0.03 - bottomBracket.y) / seatTube.y
        saddle.position.copy(bottomBracket).addScaledVector(seatTube, along)
        const postFrom = seatCluster.clone().addScaledVector(seatTube, -0.06)
        seatPost.position.copy(postFrom).lerp(saddle.position, 0.5)
        seatPost.scale.y = postFrom.distanceTo(saddle.position)
        seatPost.quaternion.setFromUnitVectors(UP, seatTube)
    }
    fitSaddle(0.8)

    // Roue : pneu, jante à flancs usinés, moyeu, 32 rayons croisés, valve.
    const spokeMaterial = new THREE.LineBasicMaterial({color: 0xc9ced3})
    function wheel() {
        const spin = new THREE.Group()
        const plane = new THREE.Group()
        // Construite dans le plan xy, puis tournée pour que l'axe soit x.
        plane.rotation.y = Math.PI / 2
        spin.add(plane)
        const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.022, 0.022, 14, 72), rubber)
        const rim = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS - 0.047, 0.01, 8, 72), alloy)
        rim.scale.z = 1.6
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.1, 14).rotateX(Math.PI / 2), alloy)
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.03, 6), chrome)
        valve.position.y = WHEEL_RADIUS - 0.07
        tire.castShadow = rim.castShadow = true
        const spokes: number[] = []
        for (let index = 0; index < 32; index++) {
            const angle = (index / 32) * Math.PI * 2, flange = index % 2 ? 0.035 : -0.035
            // Rayonnage croisé : chaque rayon part en biais du flasque, alternativement de chaque côté.
            const reach = angle + (index % 4 < 2 ? 0.42 : -0.42)
            spokes.push(Math.cos(angle) * 0.022, Math.sin(angle) * 0.022, flange,
                Math.cos(reach) * (WHEEL_RADIUS - 0.055), Math.sin(reach) * (WHEEL_RADIUS - 0.055), 0)
        }
        const spokeGeometry = new THREE.BufferGeometry()
        spokeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(spokes, 3))
        plane.add(tire, rim, hub, valve, new THREE.LineSegments(spokeGeometry, spokeMaterial))
        return spin
    }
    /** Garde-boue : arc de tôle laquée au-dessus du pneu, de `from` sur `sweep` radians (0 : vers l'arrière). */
    function fender(from: number, sweep: number) {
        const shape = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_RADIUS + 0.025, 0.028, 4, 32, sweep), paint)
        shape.scale.z = 0.5
        shape.rotation.set(0, Math.PI / 2, 0)
        shape.rotateZ(from)
        shape.castShadow = true
        return shape
    }

    const rearWheel = wheel()
    rearWheel.position.copy(rearAxle)
    const rearFender = fender(-0.35, 2.3)
    rearFender.position.copy(rearAxle)
    // Pignon et dérailleur, côté transmission : le pignon tourne avec la roue.
    const cog = new THREE.Mesh(new THREE.TorusGeometry(COG, 0.005, 6, 28).rotateY(Math.PI / 2), steel)
    cog.position.x = DRIVE_SIDE
    rearWheel.add(cog)
    const derailleur = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.03), steel)
    derailleur.position.set(DRIVE_SIDE - 0.01, WHEEL_RADIUS - 0.07, -WHEELBASE / 2 + 0.01)
    group.add(rearWheel, rearFender, derailleur)

    // Avant orientable : fourche, roue, garde-boue, potence, cintre, poignées, leviers, sonnette, phare.
    const steer = new THREE.Group()
    const steerAxis = headTop.clone().sub(headBottom).normalize()
    const crown = headBottom.clone().addScaledVector(steerAxis, -0.03)
    steer.add(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.04), paint).translateY(crown.y).translateZ(crown.z))
    for (const side of [-1, 1]) {
        const tip = frontAxle.clone().setX(side * 0.05)
        // Fourche cintrée : deux tronçons, le bas déporté vers l'avant (le déport qui stabilise la direction).
        const bend = crown.clone().lerp(tip, 0.6).setX(side * 0.05).add(point(0.012, 0))
        steer.add(tube(crown.clone().setX(side * 0.05), bend, 0.012, paint, 0.011), tube(bend, tip, 0.011, paint, 0.008))
    }
    const frontWheel = wheel()
    frontWheel.position.copy(frontAxle)
    const frontFender = fender(1.1, 2.2)
    frontFender.position.copy(frontAxle)
    // Cintre de ville relevé et ramené vers le pilote (« swept-back ») : buste droit, mains près du corps.
    const stemTop = headTop.clone().addScaledVector(steerAxis, 0.17)
    const barCenter = stemTop.clone().add(point(0, 0.03))
    steer.add(frontWheel, frontFender, tube(headTop, stemTop, 0.014, alloy), tube(stemTop, barCenter, 0.013, alloy))
    const clamp = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.05, 12).rotateZ(Math.PI / 2), alloy)
    clamp.position.copy(barCenter)
    steer.add(clamp)
    const grips: THREE.Object3D[] = []
    for (const side of [1, -1]) {
        const bend = barCenter.clone().add(point(-0.02, 0.01, side * 0.12))
        const gripStart = barCenter.clone().add(point(-0.08, 0.02, side * 0.17)), gripEnd = barCenter.clone().add(point(-0.22, 0.025, side * 0.26))
        steer.add(tube(barCenter, bend, 0.011, alloy), tube(bend, gripStart, 0.011, alloy))
        const grip = tube(gripStart, gripEnd, 0.017, rubber)
        const lever = tube(gripStart.clone().add(point(0.01, -0.01)), gripEnd.clone().add(point(0.05, -0.035, -side * 0.01)), 0.004, steel)
        // La main se pose au milieu de la poignée, juste au-dessus.
        const hand = new THREE.Object3D()
        hand.position.copy(gripStart).lerp(gripEnd, 0.5).add(point(0, 0.02))
        steer.add(grip, lever, hand)
        grips.push(hand)
    }
    const bell = new THREE.Mesh(new THREE.SphereGeometry(0.024, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), chrome)
    bell.position.copy(barCenter).add(point(0, 0.01, 0.1))
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.026, 0.06, 16).rotateX(Math.PI / 2), plastic)
    lamp.position.copy(headBottom).add(point(0.07, 0.05))
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), new THREE.MeshStandardMaterial({color: 0xfff6d8, emissive: 0xfff0c0, emissiveIntensity: 0.8}))
    lens.position.copy(lamp.position).add(point(0.031, 0))
    steer.add(bell, lamp, lens)
    group.add(steer)

    // Pédalier : plateau à cinq branches, manivelles opposées ; les pédales restent à plat (montées sur roulements).
    const crank = new THREE.Group()
    crank.position.copy(bottomBracket)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(CHAINRING, 0.006, 6, 56).rotateY(Math.PI / 2), steel)
    ring.position.x = DRIVE_SIDE
    crank.add(ring)
    for (let index = 0; index < 5; index++) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.006, CHAINRING, 0.012), alloy)
        arm.position.set(DRIVE_SIDE, 0, 0)
        arm.rotation.x = (index / 5) * Math.PI * 2
        arm.translateY(CHAINRING / 2)
        crank.add(arm)
    }
    crank.add(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.17, 10).rotateZ(Math.PI / 2), steel))
    for (const side of [-1, 1]) {
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.012, CRANK + 0.02, 0.022), alloy)
        // Manivelle gauche vers le haut à l'angle zéro, la droite (côté chaîne) vers le bas.
        arm.position.set(side * 0.08, side * CRANK / 2, 0)
        arm.castShadow = true
        crank.add(arm)
    }
    group.add(crank)
    const pedalMaterial = new THREE.MeshStandardMaterial({color: 0xf0a020, emissive: 0x3a2000, roughness: 0.4})
    const pedals = [1, -1].map((side) => {
        const pedal = new THREE.Group()
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.022, 0.065), plastic)
        body.position.x = side * 0.06
        const catEye = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.012, 0.004), pedalMaterial)
        catEye.position.set(side * 0.06, 0, 0.034)
        pedal.add(body, catEye, new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6).rotateZ(Math.PI / 2), steel))
        pedal.castShadow = true
        // Le pied se pose au centre du plateau de pédale.
        const foot = new THREE.Object3D()
        foot.position.set(side * 0.06, 0.012, 0)
        pedal.add(foot)
        group.add(pedal)
        return {pedal, foot, side}
    })

    // Chaîne : maillons instanciés, recalés le long du parcours à chaque image.
    const path = chainPath({z: rearAxle.z, y: rearAxle.y}, COG, {z: bottomBracket.z, y: bottomBracket.y}, CHAINRING)
    const links = Math.round(path.length / CHAIN_PITCH)
    const pitch = path.length / links
    const chain = new THREE.InstancedMesh(new THREE.BoxGeometry(0.007, 0.009, pitch * 1.05), steel, links)
    chain.frustumCulled = false
    group.add(chain)
    const link = new THREE.Object3D()

    let wheelAngle = 0
    function place(steerAngle: number) {
        rearWheel.rotation.x = frontWheel.rotation.x = wheelAngle
        const crankAngle = wheelAngle / GEAR
        crank.rotation.x = crankAngle
        for (const {pedal, side} of pedals) {
            // Bout de manivelle : gauche (side 1) vers le haut à l'angle zéro, droite vers le bas.
            pedal.position.set(side * 0.1, bottomBracket.y + side * CRANK * Math.cos(crankAngle), bottomBracket.z + side * CRANK * Math.sin(crankAngle))
        }
        const travel = crankAngle * CHAINRING
        for (let index = 0; index < links; index++) {
            const here = path.at(index * pitch - travel), ahead = path.at(index * pitch - travel + 0.004)
            link.position.set(DRIVE_SIDE, here.y, here.z)
            link.lookAt(DRIVE_SIDE, ahead.y, ahead.z)
            link.updateMatrix()
            chain.setMatrixAt(index, link.matrix)
        }
        chain.instanceMatrix.needsUpdate = true
        // Rotation de l'avant autour de l'axe de direction, qui passe par le bas du tube de direction.
        steer.quaternion.setFromAxisAngle(steerAxis, steerAngle)
        steer.position.copy(headBottom).sub(headBottom.clone().applyQuaternion(steer.quaternion))
    }
    place(0)

    return {
        group,
        /** Points où le pilote pose bassin, mains et pieds ; gauche puis droite. */
        anchors: {seat, grips, pedals: pedals.map(({foot}) => foot)},
        bottomBracket,
        fitSaddle,
        /** Avance de `distance` mètres (roues, pédalier, chaîne) et braque de `steerAngle` radians. */
        update(distance: number, steerAngle: number) {
            wheelAngle += distance / WHEEL_RADIUS
            place(steerAngle)
        },
    }
}

const worldQuaternion = new THREE.Quaternion(), parentQuaternion = new THREE.Quaternion(), turn = new THREE.Quaternion()
const from = new THREE.Vector3(), to = new THREE.Vector3(), hip = new THREE.Vector3(), knee = new THREE.Vector3(), end = new THREE.Vector3()
const reach = new THREE.Vector3(), bend = new THREE.Vector3(), goal = new THREE.Vector3()

/** Tourne un os d'un quaternion exprimé dans le repère du monde. */
function rotateWorld(bone: THREE.Object3D, rotation: THREE.Quaternion) {
    bone.getWorldQuaternion(worldQuaternion)
    bone.parent!.getWorldQuaternion(parentQuaternion)
    bone.quaternion.copy(parentQuaternion.invert().multiply(rotation).multiply(worldQuaternion))
    bone.updateMatrixWorld(true)
}

/** Oriente `bone` pour que `tip` (un descendant) pointe vers `target`. */
function aim(bone: THREE.Object3D, tip: THREE.Object3D, target: THREE.Vector3) {
    bone.getWorldPosition(from)
    tip.getWorldPosition(to)
    to.sub(from).normalize()
    goal.copy(target).sub(from).normalize()
    turn.setFromUnitVectors(to, goal)
    rotateWorld(bone, turn)
}

/** Cinématique inverse à deux os (cuisse et tibia, bras et avant-bras) ; `pole` : où plie l'articulation. */
function solveLimb(upper: THREE.Object3D, lower: THREE.Object3D, tip: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3) {
    upper.getWorldPosition(hip)
    lower.getWorldPosition(knee)
    tip.getWorldPosition(end)
    const a = hip.distanceTo(knee), b = knee.distanceTo(end)
    reach.copy(target).sub(hip)
    const distance = THREE.MathUtils.clamp(reach.length(), Math.abs(a - b) + 1e-4, a + b - 1e-4)
    reach.normalize()
    const cos = (a * a + distance * distance - b * b) / (2 * a * distance)
    bend.copy(pole).addScaledVector(reach, -pole.dot(reach)).normalize()
    knee.copy(hip).addScaledVector(reach, a * cos).addScaledVector(bend, a * Math.sqrt(Math.max(0, 1 - cos * cos)))
    aim(upper, lower, knee)
    aim(lower, tip, end.copy(hip).addScaledVector(reach, distance))
}

/** Os touchés par la pose, remis chaque image dans leur pose de repos (capturée au chargement, voir createTrainer). */
const RIDER_BONES = ['Body', 'Abdomen', 'Chest', 'Neck', 'UpperLegL', 'LowerLegL', 'LowerLegL_end', 'FootL', 'UpperLegR', 'LowerLegR',
    'LowerLegR_end', 'FootR', 'UpperArmL', 'LowerArmL', 'WristL', 'UpperArmR', 'LowerArmR', 'WristR'] as const
type RiderBone = typeof RIDER_BONES[number]
interface RestPose { quaternion: THREE.Quaternion; position: THREE.Vector3 }

/**
 * Pose le dresseur sur le vélo. Les pieds du modèle sont des os de contrôle détachés des jambes (rig d'IK de Blender) :
 * on les replace au bout des tibias, avec le décalage qu'ils ont au repos.
 */
export function createRiderPose(trainer: THREE.Object3D) {
    let bones: Record<RiderBone, THREE.Object3D> | null = null
    const axis = new THREE.Vector3(), lift = new THREE.Vector3(), forward = new THREE.Vector3(), side = new THREE.Vector3()
    const footOffsets = [new THREE.Vector3(), new THREE.Vector3()]
    const target = new THREE.Vector3(), left = new THREE.Vector3(), right = new THREE.Vector3(), pole = new THREE.Vector3()
    const lean = new THREE.Quaternion(), ground = new THREE.Vector3()

    function find() {
        if (bones) return bones
        const found = Object.fromEntries(RIDER_BONES.map((name) => [name, trainer.getObjectByName(name)]))
        if (Object.values(found).some((bone) => !bone?.userData.rest)) return null
        bones = found as Record<RiderBone, THREE.Object3D>
        return bones
    }
    function rest(all: Record<RiderBone, THREE.Object3D>) {
        for (const bone of Object.values(all)) {
            const pose = bone.userData.rest as RestPose
            bone.quaternion.copy(pose.quaternion)
            bone.position.copy(pose.position)
        }
        trainer.updateMatrixWorld(true)
    }

    return {
        /** Longueur de jambe (hanche → cheville) une fois le modèle chargé, pour régler la selle. */
        legLength() {
            const all = find()
            if (!all) return null
            rest(all)
            return all.UpperLegL.getWorldPosition(hip).distanceTo(all.LowerLegL.getWorldPosition(knee))
                + knee.distanceTo(all.LowerLegL_end.getWorldPosition(end))
        },
        /** `footDown` (0 à 1) : à l'arrêt, le pied gauche quitte la pédale pour se poser au sol. */
        apply(bike: Bicycle, footDown: number) {
            const all = find()
            if (!all) return
            rest(all)
            const frame = bike.group.matrixWorld
            axis.set(1, 0, 0).transformDirection(frame)
            lift.set(0, 1, 0).transformDirection(frame)
            forward.set(0, 0, 1).transformDirection(frame)
            for (const [index, key] of (['L', 'R'] as const).entries()) {
                all[`Foot${key}`].getWorldPosition(footOffsets[index]).sub(all[`LowerLeg${key}_end`].getWorldPosition(end))
            }

            // Bassin : le milieu des hanches juste au-dessus de la selle.
            all.UpperLegL.getWorldPosition(left)
            all.UpperLegR.getWorldPosition(right)
            bike.anchors.seat.getWorldPosition(target).addScaledVector(lift, 0.05)
            target.sub(left.add(right).multiplyScalar(0.5))
            all.Body.getWorldPosition(goal).add(target)
            all.Body.position.copy(all.Body.parent!.worldToLocal(goal))
            all.Body.updateMatrixWorld(true)
            // Buste penché vers le guidon, tête relevée pour regarder la route.
            for (const [bone, angle] of [[all.Body, 0.1], [all.Abdomen, 0.28], [all.Chest, 0.17], [all.Neck, -0.4]] as const) {
                rotateWorld(bone, lean.setFromAxisAngle(axis, angle))
            }

            // Jambes : chevilles un peu en arrière de l'axe de pédale (on pédale avec l'avant du pied), genoux vers l'avant.
            for (const [index, key] of (['L', 'R'] as const).entries()) {
                bike.anchors.pedals[index].getWorldPosition(target).addScaledVector(lift, 0.07).addScaledVector(forward, -0.05)
                if (index === 0 && footDown > 0) {
                    // Pointe du pied posée au sol, à gauche du pédalier (l'origine du vélo est au niveau du sol).
                    ground.set(0.26, 0, -0.02).applyMatrix4(frame)
                    ground.y = goal.setFromMatrixPosition(frame).y + 0.1
                    target.lerp(ground, footDown)
                }
                side.copy(axis).multiplyScalar(index === 0 ? 0.25 : -0.25)
                pole.copy(forward).add(side)
                solveLimb(all[`UpperLeg${key}`], all[`LowerLeg${key}`], all[`LowerLeg${key}_end`], target, pole)
                all[`LowerLeg${key}_end`].getWorldPosition(goal).add(footOffsets[index])
                const foot = all[`Foot${key}`]
                foot.position.copy(foot.parent!.worldToLocal(goal))
                foot.updateMatrixWorld(true)
            }

            // Bras : mains sur les poignées, coudes un peu ouverts et vers l'arrière.
            for (const [index, key] of (['L', 'R'] as const).entries()) {
                bike.anchors.grips[index].getWorldPosition(target)
                side.copy(axis).multiplyScalar(index === 0 ? 0.6 : -0.6)
                pole.copy(forward).multiplyScalar(-0.6).add(side).addScaledVector(lift, -0.4)
                solveLimb(all[`UpperArm${key}`], all[`LowerArm${key}`], all[`Wrist${key}`], target, pole)
            }
        },
    }
}
