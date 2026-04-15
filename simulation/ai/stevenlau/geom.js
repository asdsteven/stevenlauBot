import * as util from "simulation/ai/stevenlau/util.js"

function cosUV(x, z, angle, cos) {
    const sinSign = angle => angle <= -Math.PI || 0 <= angle && angle <= Math.PI ? 1 : -1
    if (x) {
        const u = new Vector2D(cos, -sinSign(angle) * Math.sqrt(1 - Math.square(cos))).mult(x)
        const v = u.perpendicular().mult(z / Math.abs(x))
        return [u, v]
    } else {
        const u = new Vector2D(0, 0)
        const v = new Vector2D(sinSign(angle) * Math.sqrt(1 - Math.square(cos)), cos).mult(z)
        return [u, v]
    }
}

// Four vectors in anti-clockwise.
// Use only one cosine, fast and accurate.
function cosRect(o, size, angle, cos, eps) {
    const [u, v] = cosUV(size[0] / 2 + eps, size[1] / 2 + eps, angle, cos)
    const os = [Vector2D.add(o, u).add(v),
                Vector2D.sub(o, u).add(v),
                Vector2D.sub(o, u).sub(v),
                Vector2D.add(o, u).sub(v)]
    return [[os[0], os[1], size[0] + eps * 2],
            [os[1], os[2], size[1] + eps * 2],
            [os[2], os[3], size[0] + eps * 2],
            [os[3], os[0], size[1] + eps * 2]].map(([o, p, l]) => {
                const u = Vector2D.sub(p, o)
                u.cachedLength = l
                return [o, u]
            })
}

function obstructionCluster(e, eps) {
    if (e.template.size) return [cosRect(e.pos(), e.template.size, e.angle, e.cos, eps)]
    return e.template.obstructions.map(({position, size}) => {
        const [u, v] = cosUV(position[0], position[1], e.angle, e.cos)
        return cosRect(e.pos().add(u).add(v), size, e.angle, e.cos, eps)
    })
}

function vectorExplicitIntersection(u, p, w) {
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
    if (0 < a && a < 1 && 0 < b && b < 1) return a
    return null
}

// obstructedStripe transforms obstacle to a non-zero stripe
function obstructedStripe(o, u, obstacleRect) {
    const ks = []
    for (const [p, w] of obstacleRect) {
        const op = Vector2D.sub(p, o)
        const ku = Vector2D.dot(op, u) / u.cachedLength
        const kv = Vector2D.dot(op, u.right) / u.right.cachedLength
        if (0 < ku && ku < u.cachedLength && 0 < kv && kv < u.right.cachedLength) ks.push(ku / u.cachedLength)
        if (vectorExplicitIntersection(u.right, op, w) != null) ks.push(0)
        if (vectorExplicitIntersection(u.right, Vector2D.sub(op, u), w) != null) ks.push(1)
        ks.push(vectorExplicitIntersection(u, op, w))
        ks.push(vectorExplicitIntersection(u, Vector2D.sub(op, u.right), w))
    }
    const ks_ = ks.filter(k => k != null)
    if (ks_.length < 2) return null
    return [Math.min(...ks_), Math.max(...ks_)]
}

function unobstructedStripes(stripes) {
    const unobstructed = [[0, 1]]
    for (const [a, b] of stripes) {
        for (let i = 0; i < unobstructed.length; i++) {
            const [c, d] = unobstructed[i]
            if (c < a && a < d) unobstructed.splice(i, 1, [c, a], [a, d])
            else if (c < b && b < d) unobstructed.splice(i, 1, [c, b], [b, d])
        }
    }
    for (const [a, b] of stripes) {
        for (let i = 0; i < unobstructed.length; ) {
            const [c, d] = unobstructed[i]
            if (a <= c && d <= b) unobstructed.splice(i, 1)
            else i++
        }
    }
    return unobstructed
}

export function fieldPlacements(cc, size, maxGatherers, obstacles) {
    // Can't be too small because even game engine sincos approx is inaccurate.
    // Theoretical error is around 1 / 2048.  But in practice, this is terrible.
    // We evenly distribute fields, should be fine even with tighter eps.
    const eps = 1 / 1024

    /* const svg = new util.SVGPrinter(cc.position) */

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

    const obstacleClusters = obstacles.map(obs => obstructionCluster(obs, eps))

    // o is a corner, u is the vector along CC side
    // u includes extensions on both sides.
    function onSide(o, u) {
        const obstructed = obstacleClusters
            .flatMap(rects => rects.map(rect => obstructedStripe(o, u, rect)))
            .filter(stripe => stripe != null)

        /* obstructed.forEach(([a, b]) =>
         *     svg.corners([Vector2D.mult(u, a).add(o),
         *                  Vector2D.mult(u, a).add(o).add(u.right),
         *                  Vector2D.mult(u, b).add(o).add(u.right),
         *                  Vector2D.mult(u, b).add(o)], "red", 0.1)) */

        const center = Vector2D.div(u.right, 2).add(o)
        const fields = []
        for (const [a, b] of unobstructedStripes(obstructed)) {

            /* svg.corners([Vector2D.mult(u, a).add(o),
             *              Vector2D.mult(u, a).add(o).add(u.right),
             *              Vector2D.mult(u, b).add(o).add(u.right),
             *              Vector2D.mult(u, b).add(o)], "blue", 0.1) */

            const n = Math.floor(((b - a) * u.cachedLength + size) / (size + eps)) - 1
            if (n <= 0) continue
            const sep = ((b - a) * u.cachedLength - n * size) / (n + 1)
            for (let i = 0; i < n; i++)
                fields.push(Vector2D.mult(u, (size / 2 + sep + (size + sep) * i) / u.cachedLength)
                                    .add(center))
        }
        return fields
    }

    const ccRect = cosRect(cc.pos(), cc.template.size, cc.angle, cc.cos, 0)

    /* svg.rect(ccRect, "blue")
     * obstacleClusters.forEach(rects => rects.map(rect => svg.rect(rect, "black"))) */

    const fieldSets = []
    // For each corner, we try to let one of the side to extend.
    // There are 2**4 = 16 possibilities.
    for (let bits = 0; bits < 16; bits++) {
        const fields = []
        ccRect.forEach(([o, u], i) => {
            // 0 means let the side before corner to extend;
            // 1 means let the side after corner to extend.
            const begin = (bits & 1 << i) ? extension : gap
            const end = (bits & 1 << (i + 1 & 3)) ? gap : extension
            const p = u.perpendicular().mult(-gap / u.cachedLength)
                       .add(o)
                       .sub(Vector2D.mult(u, begin / u.cachedLength))
            const w = Vector2D.mult(u, 1 + (begin + end) / u.cachedLength)
            w.cachedLength = u.cachedLength + begin + end
            w.right = u.perpendicular().mult(-size / u.cachedLength)
            w.right.cachedLength = size
            fields.push(...onSide(p, w))
        })
        fieldSets.push(fields)
    }
    const fields = fieldSets.sort((a, b) => b.length - a.length)[0]

    /* fields.forEach(o => svg.rect(cosRect(o, [size, size], cc.angle, cc.cos, 0)))
     * svg.print() */

    return fields.map(v => [v.x, v.y])
}

export function firstFarmsteadPlacement(cc, size, farmsteadSize, fruits, obstacles, eps) {
    const svg = new util.SVGPrinter(cc.position)

    const gap = 0.8 * 2 + 2 * 2 - eps
    const obstacleClusters = obstacles.map(obs => obstructionCluster(obs, eps))
    function onSide(o, u) {
        const obstructed = obstacleClusters
            .flatMap(rects => rects.map(rect => obstructedStripe(o, u, rect)))
            .filter(stripe => stripe != null)

        obstructed.forEach(([a, b]) =>
            svg.corners([Vector2D.mult(u, a).add(o),
                         Vector2D.mult(u, a).add(o).add(u.right),
                         Vector2D.mult(u, b).add(o).add(u.right),
                         Vector2D.mult(u, b).add(o)], "red", 0.1))

        const center = Vector2D.div(u.right, 2).add(o)
        const placements = []
        for (const [a, b] of unobstructedStripes(obstructed)) {

            svg.corners([Vector2D.mult(u, a).add(o),
                         Vector2D.mult(u, a).add(o).add(u.right),
                         Vector2D.mult(u, b).add(o).add(u.right),
                         Vector2D.mult(u, b).add(o)], "blue", 0.1)

            if ((b - a) * u.cachedLength > farmsteadSize) {
                placements.push(Vector2D.mult(u, (a * u.cachedLength + farmsteadSize / 2) / u.cachedLength)
                                        .add(center))
                placements.push(Vector2D.mult(u, (b * u.cachedLength - farmsteadSize / 2) / u.cachedLength)
                                        .add(center))
            }
        }
        return placements
    }
    const ccRect= cosRect(cc.pos(), cc.template.size, cc.angle, cc.cos, 0)

    svg.rect(ccRect, "blue")
    obstacleClusters.forEach(rects => rects.map(rect => svg.rect(rect, "black")))
    fruits.forEach(fruit => svg.rect(cosRect(fruit.pos(), fruit.template.size,
                                             fruit.angle, fruit.cos, 0), "red"))

    const placements = []
    for (const [o, u] of ccRect) {
        const p = u.perpendicular().mult(-(gap + size + eps) / u.cachedLength)
                   .add(o)
                   .sub(Vector2D.mult(u, (gap + size + eps + farmsteadSize) / u.cachedLength))
        const w = Vector2D.mult(u, 1 + (gap + size + eps + farmsteadSize) * 2 / u.cachedLength)
        w.cachedLength = u.cachedLength + (gap + size + eps + farmsteadSize) * 2
        w.right = u.perpendicular().mult(-farmsteadSize / u.cachedLength)
        w.right.cachedLength = farmsteadSize
        placements.push(...onSide(p, w))
    }
    for (const p of placements) {
        fruits.forEach(fruit => fruit.dist = p.distanceTo(fruit.pos()))
        p.rate = util.sum(fruits.filter(fruit => fruit.dist < 50)
                                .map(fruit => fruit.amount / fruit.dist))
    }
    placements.sort((a, b) => b.rate - a.rate)

    placements.forEach((p, i) =>
        svg.rect(cosRect(p, [farmsteadSize, farmsteadSize], cc.angle, cc.cos, 0),
                 "green", 1 - (i + 1) / placements.length))
    /* svg.print() */
    if (placements.length == 0) throw `Cannot even place a farmstead`

    return [placements[0].x, placements[0].y]
}

export function houseBarrackPlacements() {
    return {housePlacements: [], barrackPlacements: []}
}

