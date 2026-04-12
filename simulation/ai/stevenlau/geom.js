import { entitywhxya, dd } from "simulation/ai/stevenlau/util.js"

const eps = 0.000001

export function distance(a, b) {
    return Math.euclidDistance2D(a[0], a[1], b[0], b[1])
}

export function distanceSquared(a, b) {
    return Math.euclidDistance2DSquared(a[0], a[1], b[0], b[1])
}

function obstructionCorners(ent) {
    const cosx = ent.template.size[0] * ent.cos / 2
    const sinx = ent.template.size[0] * ent.sin / 2
    const cosz = ent.template.size[1] * ent.cos / 2
    const sinz = ent.template.size[1] * ent.sin / 2
    return [[cosx, sinx, cosz, sinz],
            [-cosx, -sinx, cosz, sinz],
            [-cosx, -sinx, -cosz, -sinz],
            [cosx, sinx, -cosz, -sinz]].map(([dcosx, dsinx, dcosz, dsinz]) =>
                [ent.position[0] + dcosx - dsinz,
                 ent.position[1] + dsinx + dcosz])
}

/* function pointInRect(point, segs) {
 *     return segs.every(([c1, c2]) => {
 *         const o = new Vector2D(...c1)
 *         const u = new Vector2D(...c2).sub(o)
 *         const v = new Vector2D(...point).sub(o)
 *         return u.cross(v) >= -eps
 *     })
 * } */

function rectSegs(c) {
    return [[c[0], c[1]],
            [c[1], c[2]],
            [c[2], c[3]],
            [c[3], c[0]]]
}

function vectorAlmostIntersection(u, p, w, id) {
    // au = p + bw, find a
    // aux = px + bwx | bwx = aux - px
    // auy = py + bwy | bwy = auy - py
    // wy(aux - px) = wx(auy - py)
    // a(wyux - wxuy) = wypx - wxpy
    // ux(py + bwy) = uy(px + bwx)
    // b(wyux - wxuy) = uypx - uxpy
    const r = w.y * u.x - w.x * u.y
    const a = (w.y * p.x - w.x * p.y) / r
    const b = (u.y * p.x - u.x * p.y) / r
    const au = Vector2D.mult(u, a)
    const bw = Vector2D.add(p, Vector2D.mult(w, b))
    if (-eps < a && a < 1 + eps && -eps < b && b < 1 + eps) {
        warn(`${id} au ${dd(au.x)},${dd(au.y)} | bw ${dd(bw.x)},${dd(bw.y)} | ${a} ${b}`)
        return Math.max(0, Math.min(a, 1))
    }
    return null
}

export function fieldPlacements(cc, obstacles, size, maxGatherers) {
    // We leave a small gap between field and cc.  This number comes from the
    // fact that each farmer is a 0.8 x 0.8 square and they can farm or drop
    // when they are within 2m from target.  Ideally we should let some fields
    // to touch the cc, but computation becomes complicated.
    const gap = 0.8 * 2 + 2 * 2 - eps

    // We allow some part of a field to extend beyond the width of the cc.
    // We still set a limit so that there is enough space for all farmers to
    // farm within the width of cc so that they do not have to walk to drop
    // resources.  No need epsilon because sqrt(2) is rounded up.
    // 25.47 for most civ, 15.73 for Han.
    const extension = size - 0.8 * 1.414214 * (maxGatherers - 1)

    const projectOnVector = (v, u) => Vector2D.dot(v, u) / u.lengthSquared()

    // ouv is the origin and two vectors forming a rect area to place fields.
    // innerObstacle transforms obstacle to a non-zero bound of [au, bu]
    function innerObstacle(o, u, v, obstacle) {
        const aus = []
        for (const [c1, c2] of rectSegs(obstructionCorners(obstacle))) {
            const p = new Vector2D(...c1).sub(o)
            const au = projectOnVector(p, u)
            const bv = projectOnVector(p, v)
            if (-eps < au && au < 1 + eps && -eps < bv && bv < 1 + eps) aus.push(Math.max(0, Math.min(au, 1)))
            const w = new Vector2D(...c2).sub(new Vector2D(...c1))
            if (vectorAlmostIntersection(v, p, w, 1) != null) aus.push(0)
            if (vectorAlmostIntersection(v, Vector2D.sub(p, u), w, 2) != null) aus.push(1)
            aus.push(vectorAlmostIntersection(u, p, w, 3))
            aus.push(vectorAlmostIntersection(u, Vector2D.sub(p, v), w, 4))
            /* const jj = Vector2D.add(o, Vector2D.add(Vector2D.mult(u, au), Vector2D.mult(v, bv))) */
            /* warn(`${dd(c1[0])},${dd(c1[1])} => ${JSON.stringify(aus.filter(au => au != null).map(dd))}`) */
        }
        const aus_ = aus.filter(au => au != null).sort()
        if (aus_.length < 2) return null
        return [Math.min(...aus_), Math.max(...aus_)]
    }

    // o is a corner, u is the vector along CC side, v is normal.
    // u includes extensions on both sides.
    function onSide(o, u, v) {
        const cleanSegments = [[0, 1]]
        warn(`o: ${dd(o.x)} ${dd(o.y)}`)
        warn(`u: ${dd(u.x)} ${dd(u.y)} ${u.length()}`)
        warn(`v: ${dd(v.x)} ${dd(v.y)} ${v.length()}`)
        const bounds = obstacles.map(obs => innerObstacle(o, u, v, obs)).filter(bound => bound != null)
        for (const [a, b] of bounds) {
            for (let i = 0; i < cleanSegments.length; i++) {
                const [c, d] = cleanSegments[i]
                if (c < a && a < d) cleanSegments.splice(i, 1, [c, a], [a, d])
                else if (c < b && b < d) cleanSegments.splice(i, 1, [c, b], [b, d])
            }
        }
        for (const [a, b] of bounds) {
            for (let i = 0; i < cleanSegments.length; ) {
                const [c, d] = cleanSegments[i]
                if (a <= c && d <= b) cleanSegments.splice(i, 1)
                else i++
            }
            /* warn(`${a}:${b} => ` + "cleanSegments: " + cleanSegments.map(([a, b]) => `${dd(a)}:${dd(b)}`).join(" ")) */
        }

        // debug
        warn("cleanSegments: " + cleanSegments.map(([a, b]) => `${dd(a)}:${dd(b)}`).join(" "))

        const fields = []
        const center = o.clone()
                        .add(Vector2D.div(v, 2))
                        .add(Vector2D.mult(u, (size / 2 / u.cachedLength)))
        for (const [a, b] of cleanSegments) {
            const space = (b - a) * u.cachedLength
            const n = Math.floor((space + size) / (size + eps)) - 1
            if (n <= 0) continue
            const sep = (space - n * size) / (n + 1)
            const h = Vector2D.mult(u, (size + sep) / u.cachedLength)
            const p = Vector2D.add(center, Vector2D.mult(u, a + sep / u.cachedLength))
            for (let i = 0; i < n; i++) {
                fields.push([p.x, p.y])
                p.add(h)
            }
        }

        // debug
        warn("fields: " + fields.map(([a, b]) => `(${dd(a)},${dd(b)})`).join(" "))

        return fields
    }

    const segs = rectSegs(obstructionCorners(cc))
    segs[0].cachedLength = cc.template.size[0]
    segs[1].cachedLength = cc.template.size[1]
    segs[2].cachedLength = cc.template.size[0]
    segs[3].cachedLength = cc.template.size[1]

    // debug
    warn(`field size: ${size} max gatherers: ${maxGatherers}`)
    warn(`CC: ${entitywhxya(cc)} ${dd(cc.cos)} ${dd(cc.sin)}`)

    const placements = []
    // For each corner, we try to let one of the side to extend.
    // There are 2**4 = 16 possibilities.
    for (let bits = 0; bits < 16; bits++) {
        const fields = []
        segs.forEach((seg, i) => {
            // debug
            /* if (i > 0) return */

            // 0 means let the side before corner to extend;
            // 1 means let the side after corner to extend.
            const begin = (bits & 1 << i) ? extension : gap
            const end = (bits & 1 << (i + 1 & 3)) ? gap : extension

            const u = new Vector2D(...seg[1]).sub(new Vector2D(...seg[0])).mult(1 + (begin + end) / seg.cachedLength)
            u.cachedLength = begin + seg.cachedLength + end
            const v = new Vector2D(u.y, -u.x).mult(size / u.cachedLength)
            const o = new Vector2D(...seg[0]).sub(Vector2D.mult(u, begin / u.cachedLength))
                                             .add(Vector2D.mult(v, gap / size))
            fields.push(...onSide(o, u, v))
        })
        placements.push(fields)

        // debug
        /* break */
    }
    warn(JSON.stringify(placements.map(x => x.length)))
    return placements.sort((a, b) => b.length - a.length)[0]
}

export function firstFarmsteadPlacement(fieldPlacements) {

}

export function houseBarrackPlacements() {
    return {housePlacements: [], barrackPlacements: []}
}

