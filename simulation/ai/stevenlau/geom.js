import * as util from "simulation/ai/stevenlau/util.js"

export function cosUV(x, z, angle, cos) {
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

// Rect is four sides as vectors in either all cw or all ccw
export class Rect {
    // Requires providing all four corners at high precision
    constructor(os, [u, ul], [v, vl]) {
        this.sides = [[os[0], u, ul],
                      [os[1], v, vl],
                      [os[2], Vector2D.mult(u, -1), ul],
                      [os[3], Vector2D.mult(v, -1), vl]]
    }

    static fromOUV(o, [u, ul], [v, vl]) {
        return new Rect([o, Vector2D.add(o, u), Vector2D.add(o, u).add(v), Vector2D.add(o, v)],
                        [u, ul], [v, vl])
    }

    // Uses only one cosine, fast and accurate.  Vectors in
    // anti-clockwise.
    static fromCenter(center, size, angle, cos, eps) {
        const [hu, hv] = cosUV(size[0] / 2 + eps, size[1] / 2 + eps, angle, cos)
        return new Rect([Vector2D.sub(center, hu).sub(hv),
                         Vector2D.add(center, hu).sub(hv),
                         Vector2D.add(center, hu).add(hv),
                         Vector2D.sub(center, hu).add(hv)],
                        [Vector2D.mult(hu, 2), size[0] + eps * 2],
                        [Vector2D.mult(hv, 2), size[1] + eps * 2])
    }
}

function vectorIntersection(u, p, w) {
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
    if (0 < a && a < 1 && 0 < b && b < 1) return Math.max(0, Math.min(a, 1))
    return false
}

// List of rects like [au, bu], [au, bu], ...
export class Stripe {
    constructor(o, [u, ul], [v, vl]) {
        this.o = o
        this.u = u
        this.ul = ul
        this.v = v
        this.vl = vl
        this.clips = [[0, 1]]
    }

    obstructedClip(obstruction) {
        const ks = obstruction.sides.flatMap(([p, w, wl]) => {
            const op = Vector2D.sub(p, this.o)
            const ku = Vector2D.dot(op, this.u) / this.ul
            const kv = Vector2D.dot(op, this.v) / this.vl
            return [0 < ku && ku < this.ul && 0 < kv && kv < this.vl && ku / this.ul,
                    vectorIntersection(this.v, op, w) !== false && 0,
                    vectorIntersection(this.v, Vector2D.sub(op, this.u), w) !== false && 1,
                    vectorIntersection(this.u, op, w),
                    vectorIntersection(this.u, Vector2D.sub(op, this.v), w)].filter(k => k !== false)
        })
        return [Math.min(...ks), Math.max(...ks)]
    }

    obstruct(obstructions) {
        this.clips = []
        let k = 0
        obstructions.map(obs => this.obstructedClip(obs))
                    .filter(([a, b]) => a < b)
                    .sort(([a1,], [a2,]) => a1 - a2)
                    .forEach(([a, b]) => {
                        if (k < a) this.clips.push([k, a])
                        if (k < b) k = b
                    })
        if (k < 1) this.clips.push([k, 1])
        return this
    }

    rects() {
        return this.clips.map(([a, b]) =>
            Rect.fromOUV(Vector2D.mult(this.u, a).add(this.o),
                         [Vector2D.mult(this.u, b - a), b - a], [this.v, this.vl]))
    }
}

export class Placement {
    constructor(template, position, angle, cos) {
        this.template = template
        this.position = position
        this.angle = angle

        this.cos = cos
        this.offset = new Vector2D(0, 0)
        this.tries = 0
    }

    key() {
        const p = Vector2D.add(this.position, this.offset).round()
        return `foundation|${this.template.name} ${p.x} ${p.y}`
    }

    square() {
        const size = Math.max(...this.template.size)
        return Rect.fromCenter(this.position, [size, size], this.angle, this.cos, 0)
    }

    rect() {
        return Rect.fromCenter(this.position, this.template.size, this.angle, this.cos, 0)
    }
}

export function fieldStripes(template, extendEnds, dropsite, obstructions, eps) {
    if (template.size[0] != template.size[1]) throw `field is not a square: ${field.size[0]}x${field.size[1]}`
    const size = template.size[0]

    // We first leave a small gap between field and dropsite to pack
    // as many fields as possible.  This number comes from the fact
    // that each farmer is a 0.8 x 0.8 square and they can farm or
    // drop when they are within 2m from target.  After calculating
    // the max number of fields, we would shrink the gap.
    const gap = (0.8 + 2) * 2 - 2 * eps

    // We allow some part of a field to extend beyond the width of the
    // dropsite.  We still set a limit so that there is enough space
    // for all farmers to farm within the width of dropsite so that
    // they do not have to walk to drop resources.  17.47 for most
    // civ, 15.73 for Han.
    const extension = size - 0.8 * Math.sqrt(2) * (template.maxGatherers - 1) - eps

    return dropsite.rect.sides.map(([o, u, ul], i) => {
        const extendBegin = !extendEnds[i + 3 & 3]
        const extendEnd = extendEnds[i]
        const begin = extendBegin ? extension : gap
        const end = extendEnd ? extension : gap
        const p = Vector2D.sub(o, Vector2D.mult(u, begin / ul))
                          .sub(u.perpendicular().mult(eps / ul))
        const w = Vector2D.mult(u, 1 + (begin + end) / ul)
        const wl = begin + ul + end
        const v = u.perpendicular().mult(-(gap + size) / ul)
        return [new Stripe(p, [w, wl], [v, gap + size]).obstruct(obstructions),
                [begin, extendBegin], [begin + ul, extendEnd]]
    })
}

export function fieldPlacements(template, stripes, eps) {
    if (template.size[0] != template.size[1]) throw `field is not a square: ${field.size[0]}x${field.size[1]}`
    const size = template.size[0]
    const sides = stripes.map(([stripe, [begin, extendBegin], [end, extendEnd]]) =>
        [stripe, [begin, extendBegin], [end, extendEnd],
         stripe.clips.map(([a, b]) => {
             a *= stripe.ul
             b *= stripe.ul
             const n = Math.floor((b - a + size) / (size + eps)) - 1
             if (n <= 0) return [0, null, null, null]
             const evenSep = (a, b) => [n, a, b, (b - a - n * size) / (n + 1)]
             const tight = n * size + (n + 1) * eps
             const tightFrom = a => [n, a, a + tight, eps]
             if (begin < a && b < end) {
                 // We are well inside.  Just distribute evenly.
                 return evenSep(a, b)
             } else if (b < end) {
                 if (begin < b - tight) {
                     // Can be well inside.  Distribute evenly.
                     return evenSep(begin, b)
                 } else {
                     // Have to extend anyway.  Gravity to b.
                     return tightFrom(b - tight)
                 }
             } else if (begin < a) {
                 if (a + tight < end) {
                     // Can be well inside.  Distribute evenly.
                     return evenSep(a, end)
                 } else {
                     // Have to extend anyway.  Gravity to a.
                     return tightFrom(a)
                 }
             } else if (tight < end - begin) {
                 // Can be well inside.  Distribute evenly.
                 return evenSep(begin, end)
             } else if (extendBegin == extendEnd) {
                 // Both sides are of same type, gravity center.
                 const x = tight - (end - begin)
                 return tightFrom(begin - x / 2)
             } else if (extendBegin) {
                 // Get rid of end gap.
                 return tightFrom(Math.max(a, end - tight))
             } else {
                 // Get rid of begin gap.
                 return tightFrom(Math.min(b - tight, begin))
             }
    })])
    return sides.flatMap(([stripe, [begin, extendBegin], [end, extendEnd], clips], i) => clips.flatMap(([n, a, b, sep]) => {
        if (n == 0) return []
        const prevSide = sides[i + 3 & 3]
        const [, , [prevEnd, prevExtend]] = prevSide
        const nextSide = sides[i + 1 & 3]
        const [, [nextBegin, nextExtend]] = nextSide
        const ps = []
        for (let j = 0; j < n; j++) {
            const k = a + sep + size / 2 + j * (sep + size)
            let gap = 0
            if (k - size / 2 < begin && !prevExtend) {
                const prevClips = prevSide.at(-1)
                const [, , prevB] = prevClips.at(-1)
                gap = Math.max(0, prevB - prevEnd)
            } else if (k + size / 2 > end && !nextExtend && extendEnd) {
                // if not extendEnd, the next side should escape for me.
                const nextClips = nextSide.at(-1)
                const [, nextA] = nextClips[0]
                gap = Math.max(0, nextBegin - nextA)
            }
            ps.push([Vector2D.add(Vector2D.mult(stripe.v, (gap + size / 2) / stripe.vl),
                                  Vector2D.mult(stripe.u, k / stripe.ul)).add(stripe.o),
                     gap])
        }
        return ps
    }))
}

export function firstFarmsteadPlacement(cc, fieldSize, size, fruits, obstructions, eps) {
    const gapField = (0.8 + 2) * 2 - 1 / 32 + fieldSize + eps

    const stripe = cc.rect.sides.flatMap(([o, u, ul]) => {
        const p = u.perpendicular().mult(-gapField / ul)
                   .add(o)
                   .sub(Vector2D.mult(u, (gapField + size) / ul))
        const w = Vector2D.mult(u, 1 + (gapField + size) * 2 / ul)
        const v = u.perpendicular().mult(-size / ul)
        return new Stripe().populate(p, [w, ul + (gapField + size) * 2], [v, size], obstructions, eps)
    })
    const possibilities = stripe.filter(([{ul}, a, b]) => (b - a) * ul > size + eps)
                                .flatMap(([{u, ul, center}, a, b]) =>
        [Vector2D.mult(u, a + size / 2 / ul).add(center),
         Vector2D.mult(u, b - size / 2 / ul).add(center)])
                                .map(p => [p, util.sum(fruits.map(e => [e.amount, p.distanceTo(e.pos())])
                                                             .filter(([amount, dist]) => dist < 50)
                                                             .map(([amount, dist]) => amount / dist))])
    const position = possibilities.sort(([,a], [,b]) => b - a)[0][0]
    position.stripe = stripe
    return position
}

export function housesBarracksPlacements(cc, fieldSize, houseSize, barracksSize, obstructions, eps) {
    return {housePlacements: [], barrackPlacements: []}
}

