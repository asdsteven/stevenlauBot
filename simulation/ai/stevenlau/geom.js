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

// We care about the most precise representation of a rectangle.
// First, four corners must be evaluated.
// Second, four side vectors should be precisely provided when possible.
export class Rect {
    // Requires providing all four corners at high precision
    constructor(os, [u, ul], [v, vl]) {
        this.edges = [[os[0], u, ul],
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

    disjoint(rect) {
        const normals = this.edges.concat(rect.edges).map(([,v]) => v.perpendicular())
        return normals.some(normal => {
            const t1s = this.edges.map(([o]) => o.dot(normal))
            const t2s = rect.edges.map(([o]) => o.dot(normal))
            const [l1, r1] = [Math.min(...t1s), Math.max(...t1s)]
            const [l2, r2] = [Math.min(...t2s), Math.max(...t2s)]
            return r1 < l2 || r2 < l1
        })
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
    const r = u.cross(w)
    if (!r) return false
    const a = p.cross(w) / r
    const b = p.cross(u) / r
    if (0 < a && a < 1 && 0 < b && b < 1) return a
    return false
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

export function firstFarmsteadPlacement(farmstead, fields, cc, fruits, obstructions, eps) {
    const gapField = (0.8 + 2) * 2 - 1 / 32 + fieldSize + eps

    const strip = cc.rect.edges.flatMap(([o, u, ul]) => {
        const p = u.perpendicular().mult(-gapField / ul)
                   .add(o)
                   .sub(Vector2D.mult(u, (gapField + size) / ul))
        const w = Vector2D.mult(u, 1 + (gapField + size) * 2 / ul)
        const v = u.perpendicular().mult(-size / ul)
        return new Strip().populate(p, [w, ul + (gapField + size) * 2], [v, size], obstructions, eps)
    })
    const possibilities = strip.filter(([{ul}, a, b]) => (b - a) * ul > size + eps)
                               .flatMap(([{u, ul, center}, a, b]) =>
                                   [Vector2D.mult(u, a + size / 2 / ul).add(center),
                                    Vector2D.mult(u, b - size / 2 / ul).add(center)])
                               .map(p => [p, util.sum(fruits.map(e => [e.amount, p.distanceTo(e.pos())])
                                                            .filter(([amount, dist]) => dist < 50)
                                                            .map(([amount, dist]) => amount / dist))])
    const position = possibilities.sort(([,a], [,b]) => b - a)[0][0]
    position.strip = strip
    return position
}

export function housesBarracksPlacements(cc, fieldSize, houseSize, barracksSize, obstructions, eps) {
    return {housePlacements: [], barrackPlacements: []}
}

// Mathematical guarantees something.  Use it as a comment to remind human that
// it guarantees an important condition that could help human to reason about
// the following code.  It should never fail.
function guarantees(cond, notes) {
    if (!cond) throw `Failed guarantee: ${notes}`
}

function lerp(a, b, p) {
    const l = Math.min(a, b)
    const h = Math.max(a, b)
    return Math.min(Math.max(a * p + b * (1 - p), l), h)
}

class Trapezium {
    constructor([u, uh], [v, vh]) {
        guarantees(u.x < v.x && uh > 0 && vh > 0, `Trapezium width and heights must be positive: ${u.x} < ${v.x}, ${uh} > 0, ${vh} > 0`)
        this.u = u
        this.uh = uh
        this.v = v
        this.vh = vh
    }

    get uv() {
        return Vector2D.sub(this.v, this.u)
    }

    contains(x) {
        return this.u.x <= x && x <= this.v.x
    }

    split(x) {
        guarantees(this.contains(x), `Trapezium split [${this.u.x}, ${this.v.x}] does not contain ${x}`)
        const p = (this.v.x - x) / this.uv.x
        guarantees(0 <= p && p <= 1, `Trapezium split invalid p: 0 <= (${this.v.x} - ${x}) / ${this.uv.x} <= 1`)
        const m = new Vector2D(lerp(this.u.x, this.v.x, p),
                               lerp(this.u.y, this.v.y, p))
        const mh = lerp(this.uh, this.vh, p)
        return [new Trapezium([this.u, this.uh], [m, mh]),
                new Trapezium([m, mh], [this.v, this.vh])]
    }
}

function trapezoidalDecomposition(o, [u, ul], [v, vl], obstructions, svg) {
    const enters = new Map()
    const leaves = new Map()
    for (const a of obstructions) {
        for (const b of obstructions) {
        }
    }
}

class Slope {
    constructor(t0, h0, t9, h9) {
        guarantees(t0 < t9, `cannot handle vertical line, sorry: ${t0}, ${t9}`)
        this.t0 = t0
        this.h0 = h0
        this.t9 = t9
        this.h9 = h9
    }

    static fromH([t0, , h0, t1, , h1]) {
        return new Slope(t0, h0, t1, h1)
    }

    static fromL([t0, l0, , t1, l1]) {
        return new Slope(t0, l0, t1, l1)
    }

    contains(t) {
        return this.t0 <= t && t <= this.t9
    }

    h(t) {
        guarantees(this.contains(t), `people should guarantee this before calling me ${this.t0} ${t} ${this.t9}`)
        const p = (this.t9 - t) / (this.t9 - this.t0)
        return lerp(this.h0, this.h9, p)
    }

    max() {
        if (this.h0 > this.h9) return [this.h0, this.t0]
        return [this.h9, this.t9]
    }
}

class Constraint {
    constructor(n, corners) {
        guarantees(corners.length <= 2, "contraint affects at most corners")
        this.n = n
        this.corners = corners
    }

    clone() {
        return new Constraint(this.n, this.corners.map(c => {
            if (c.ext) {
                return {cornerId: c.cornerId, ext: c.ext.slice()}
            } else {
                return {cornerId: c.cornerId, rise: c.rise.slice()}
            }
        }))
    }

    at(cornerId) {
        return this.corners.find(({cornerId: id}) => id == cornerId)
    }

    adjust(cornerId, value) {
        const i = this.corners.findIndex(({cornerId: id}) => id == cornerId)
        if (this.corners[i].ext) {
            const ext = this.corners[i].ext
            const [ext0, ext1] = ext[1] > ext[0] ? [0, 1] : [1, 0]
            if (value >= ext[ext1]) return
            guarantees(value >= ext[ext0], `corner ${cornerId} ext cannot adjust need ${value} >= ${ext[ext0]}`)
            const pair = this.corners[1 - i]
            if (pair) {
                const p = (ext[ext1] - value) / (ext[ext1] - ext[ext0])
                if (pair.ext) {
                    pair.ext[ext1] = lerp(pair.ext[ext0], pair.ext[ext1], p)
                } else {
                    pair.rise[ext1] = lerp(pair.rise[ext0], pair.rise[ext1], p)
                }
            }
            ext[ext1] = value
        } else {
            const rise = this.corners[i].rise
            const [rise0, rise1] = rise[1] > rise[0] ? [0, 1] : [1, 0]
            if (value <= rise[rise0]) return
            guarantees(value <= rise[rise1], `corner ${cornerId} rise cannot adjust need ${value} <= ${rise[rise1]}`)
            const pair = this.corners[1 - i]
            if (pair) {
                const p = (rise[rise1] - value) / (rise[rise1] - rise[rise0])
                if (pair.ext) {
                    pair.ext[rise0] = lerp(pair.ext[rise0], pair.ext[rise1], p)
                } else {
                    pair.rise[rise0] = lerp(pair.rise[rise0], pair.rise[rise1], p)
                }
            }
            rise[rise0] = value
        }
    }

    adjustRise1(cornerId, value) {
        const i = this.corners.findIndex(({cornerId: id}) => id == cornerId)
        const rise = this.corners[i].rise
        const [rise0, rise1] = rise[1] > rise[0] ? [0, 1] : [1, 0]
        if (value == rise[rise1]) return
        guarantees(value >= rise[rise0] && value < rise[rise1], `corner ${cornerId} rise cannot adjust need ${value} >= ${rise[rise0]}`)
        const pair = this.corners[1 - i]
        if (pair) {
            const p = (rise[rise1] - value) / (rise[rise1] - rise[rise0])
            if (pair.ext) {
                pair.ext[rise1] = lerp(pair.ext[rise0], pair.ext[rise1], p)
            } else {
                pair.rise[rise1] = lerp(pair.rise[rise0], pair.rise[rise1], p)
            }
        }
        rise[rise1] = value
    }

    static consistent(constraints) {
        // We will be modifying it, so make a clone
        constraints = constraints.map(c => c.clone())

        const corners = [[], [], [], []]
        for (const constraint of constraints) {
            for (const {cornerId} of constraint.corners) {
                corners[cornerId].push(constraint)
            }
        }
        let changed = true
        while (changed) {
            changed = false
            for (const [cornerId, constraints] of corners.entries()) {
                if (constraints.length != 2) continue
                let [c, d] = constraints
                if (c.at(cornerId).ext && d.at(cornerId).ext) return null
                if (c.at(cornerId).rise && d.at(cornerId).rise) return null
                if (!c.at(cornerId).ext) [c, d] = [d, c]
                if (Math.min(...c.at(cornerId).ext) > Math.max(...d.at(cornerId).rise)) return null
                const rise1 = Math.max(...d.at(cornerId).rise)
                if (Math.max(...c.at(cornerId).ext) > rise1) {
                    c.adjust(cornerId, rise1)
                    changed = true
                }
                const ext0 = Math.min(...c.at(cornerId).ext)
                if (ext0 > Math.min(...d.at(cornerId).rise)) {
                    d.adjust(cornerId, ext0)
                    changed = true
                }
            }
        }
        return [constraints, corners]
    }

    static consolidate(edges, field, [constraints, corners], allStrips) {
        const gap = (0.8 + 2) * 2
        const extension = field.size[0] - 0.8 * Math.sqrt(2) * (field.maxGatherers - 1)
        const vl = field.size[0] + gap
        const vv = vl * vl
        const svv = field.size[0] * vl
        // constraints should be cloned in consistent already, no clone again

        // All rises take minimum
        let changed = true
        while (changed) {
            changed = false
            for (const [cornerId, constraints] of corners.entries()) {
                if (constraints.length != 2) continue
                let [c, d] = constraints
                if (!c.at(cornerId).ext) [c, d] = [d, c]
                const rise1 = Math.max(...d.at(cornerId).rise)
                if (Math.max(...c.at(cornerId).ext) > rise1) {
                    print(`debug adjust ext1 from ${Math.max(...c.at(cornerId).ext)} to ${rise1}\n`)
                    c.adjust(cornerId, rise1)
                    changed = true
                    break
                }
                const ext0 = Math.min(...c.at(cornerId).ext)
                if (ext0 > Math.min(...d.at(cornerId).rise)) {
                    print(`debug adjust rise0 from ${Math.min(...d.at(cornerId).rise)} to ${ext0}\n`)
                    d.adjust(cornerId, ext0)
                    changed = true
                    break
                }
                if (Math.max(...d.at(cornerId).rise) != Math.min(...d.at(cornerId).rise)) {
                    print(`debug adjust rise1 from ${Math.max(...d.at(cornerId).rise)} to ${Math.min(...d.at(cornerId).rise)}\n`)
                    d.adjustRise1(cornerId, Math.min(...d.at(cornerId).rise))
                    changed = true
                    break
                }
            }
        }

        let penalty = 0
        const centers = []
        for (const [stripId, constraint] of constraints.entries()) {
            // print(`debug consolidating strip ${stripId}\n`)
            const [edgeId, strip, exhausts] = allStrips[stripId]
            const t0 = strip[0][0]
            const t9 = strip.at(-1)[3]
            const oul = edges[edgeId]
            const v = oul[1].perpendicular().mult(-vl / oul[2])
            const ul = oul[2] + 2 * extension
            const uu = ul * ul
            const u = Vector2D.mult(oul[1], ul / oul[2])
            const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
            const suu = field.size[0] * ul
            const euu = extension * ul
            const ueu = (oul[2] + extension) * ul
            const add = (t, rise) => {
                const x = Vector2D.mult(u, (t + suu / 2) / uu)
                const y = Vector2D.mult(v, (rise + field.size[1] / 2) / vl)
                centers.push(x.add(y).add(o))
                penalty += rise
            }
            const addLowest = t => {
                for (const slope of strip.map(Slope.fromL)) {
                    if (slope.contains(t)) {
                        add(t, slope.h(t) / vl) // slope.h is l
                        return
                    }
                }
                guarantees(false, `strip ${stripId} t ${t} is not within t0 = ${t0}, t9 = ${t9}, ${JSON.stringify(strip)}`)
            }
            const addRise = (t, rise, bound) => {
                let last = null
                for (const [t0, l0, h0, t9, l9, h9] of strip) {
                    let [t1, t8] = [Math.max(t0, t), t9]
                    if (bound != null) t8 = Math.min(t8, bound)
                    if (t8 < t1) continue
                    if (h0 / vl < rise + field.size[1] && h9 / vl < rise + field.size[1]) continue
                    if (h0 / vl < rise + field.size[1]) {
                        const p = (h9 / vl - rise - field.size[1]) / (h9 / vl - h0 / vl)
                        t1 = Math.max(t1, lerp(t0, t9, p))
                    }
                    if (h9 / vl < rise + field.size[1]) {
                        const p = (h0 / vl - rise - field.size[1]) / (h0 / vl - h9 / vl)
                        t8 = Math.min(t8, lerp(t9, t0, p))
                    }
                    if (t8 < t1) continue
                    const p1 = (t9 - t1) / (t9 - t0)
                    const rise1 = Math.max(rise, lerp(l0 / vl, l9 / vl, p1))
                    if (bound == null) {
                        add(t1, rise1)
                        return [rise1, t1]
                    }
                    const p8 = (t9 - t8) / (t9 - t0)
                    const rise8 = Math.max(rise, lerp(l0 / vl, l9 / vl, p8))
                    last = [rise8, t8]
                }
                add(last[1], last[0])
                return last
            }
            if (constraint.corners.length == 0) {
                // print("debug case 1\n")
                for (let i = 0; i < constraint.n; i++) {
                    addLowest(Math.max(t0, euu) + i * suu)
                }
            } else if (constraint.corners.length == 1) {
                const c = constraint.corners[0]
                // print(`debug case 2 ${JSON.stringify(c)}\n`)
                for (let i = 0; i < constraint.n; i++) {
                    if (c.cornerId == edgeId) {
                        const t = Math.min(t9, ueu - suu) - i * suu
                        if (c.rise && i == constraint.n - 1 && corners[c.cornerId].length == 2) {
                            guarantees(c.rise[0] == c.rise[1], "static constraint")
                            const other = corners[c.cornerId][1 - corners[c.cornerId].indexOf(constraint)]
                            const [l, lt] = addRise(t0, Math.min(...other.at(c.cornerId).ext), t)
                            other.adjust(c.cornerId, l)
                        } else {
                            addLowest(t)
                        }
                    } else {
                        const t = Math.max(t0, euu) + i * suu
                        if (c.rise && i == constraint.n - 1 && corners[c.cornerId].length == 2) {
                            guarantees(c.rise[0] == c.rise[1], "static constraint")
                            const other = corners[c.cornerId][1 - corners[c.cornerId].indexOf(constraint)]
                            const [l, lt] = addRise(t, Math.min(...other.at(c.cornerId).ext), null)
                            other.adjust(c.cornerId, l)
                        } else {
                            addLowest(t)
                        }
                    }
                }
            } else {
                // print("debug case 3\n")
                guarantees(constraint.corners.length == 2, "constraint.corners <= 2")
                const [c, d] = constraint.corners
                let t = t0
                if (c.ext && d.ext) {
                    constraint.adjust(d.cornerId, Math.min(...d.ext))
                }
                if (c.ext) {
                    t = Math.max(t, euu - Math.max(...c.ext) * ul)
                }
                for (let i = 0; i < constraint.n; i++) {
                    if (c.rise && i == 0 && corners[c.cornerId].length == 2) {
                        const other = corners[c.cornerId][1 - corners[c.cornerId].indexOf(constraint)]
                        const [l, lt] = addRise(t, Math.min(...other.at(c.cornerId).ext), null)
                        other.adjust(c.cornerId, l)
                        t = lt + suu
                    } else if (d.rise && i == constraint.n - 1 && corners[d.cornerId].length == 2) {
                        const other = corners[d.cornerId][1 - corners[d.cornerId].indexOf(constraint)]
                        const [l, lt] = addRise(t, Math.min(...other.at(d.cornerId).ext), null)
                        other.adjust(d.cornerId, l)
                    } else {
                        addLowest(t)
                        t += suu
                    }
                }
                // print("debug case 3 end\n")
            }
        }
        return [penalty, centers]
    }

    static none(n) {
        return new Constraint(n, [])
    }

    static ext(n, cornerId, ext) {
        return new Constraint(n, [{cornerId: cornerId, ext: [ext, ext]}])
    }

    static rise(n, cornerId, s, h) {
        return new Constraint(n, [{cornerId: cornerId, rise: [h - s, h - s]}])
    }

    static extExt(n, edgeId, begin0, begin1, end0, end1) {
        return new Constraint(n, [{cornerId: edgeId, ext: [begin0, begin1]},
                                  {cornerId: edgeId + 1 & 3, ext: [end0, end1]}])
    }

    static extRise(n, edgeId, s, ext0, ext1, h0, h1) {
        return new Constraint(n, [{cornerId: edgeId, ext: [ext0, ext1]},
                                  {cornerId: edgeId + 1 & 3, rise: [h0 - s, h1 - s]}])
    }

    static riseExt(n, edgeId, s, h0, h1, ext0, ext1) {
        return new Constraint(n, [{cornerId: edgeId, rise: [h0 - s, h1 - s]},
                                  {cornerId: edgeId + 1 & 3, ext: [ext0, ext1]}])
    }

    static riseRise(n, edgeId, s, h0, h1, h2, h3) {
        return new Constraint(n, [{cornerId: edgeId, rise: [h0 - s, h1 - s]},
                                  {cornerId: edgeId + 1 & 3, rise: [h2 - s, h3 - s]}])
    }
}

class TrapezoidalStrip {
    static forFields(o, [u, ul], [v, vl], obstructions, field, svg) {
        print("geom trapezoidal decomposition start\n")
        const trapeziums = TrapezoidalStrip.forFields1D(o, [u, ul], [v, vl], obstructions, field, svg)
        print("geom trapezoidal decomposition 1D finished\n")
        const strips = TrapezoidalStrip.forFields2D(trapeziums, field.size[0] * ul, field.size[0] * vl, svg)
        print("geom trapezoidal decomposition 2D finished\n")
        if (svg) {
            const uu = ul * ul
            const vv = vl * vl
            for (const [t0, l0, h0, t1, l1, h1] of trapeziums) {
                svg.corners([
                    Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, l0 / vv)),
                    Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l1 / vv)),
                    Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h1 / vv)),
                    Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, h0 / vv))
                ].map(({x,y}) => [x,y]), "green", 0.7)
            }
            let i = 0
            for (const strip of strips) {
                for (const slit of strip) {
                    continue
                    const [t1, l17, h17, t2, l28, h28] = slit
                    if (t2 / uu <= t1 / uu + field.size[0] / ul) {
                        svg.corners([
                            Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l17 / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.min(l17, l28) / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.max(h17, h28) / vv)),
                            Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h17 / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                        svg.corners([
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.min(l17, l28) / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.min(l17, l28) / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.max(h17, h28) / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.max(h17, h28) / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                        svg.corners([
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.min(l17, l28) / vv)),
                            Vector2D.mult(u, t2 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, l28 / vv)),
                            Vector2D.mult(u, t2 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, h28 / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.max(h17, h28) / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                    } else {
                        const p = (t2 / uu - (t1 / uu + field.size[0] / ul)) / (t2 / uu - t1 / uu)
                        const q = (t2 / uu - (t2 / uu - field.size[0] / ul)) / (t2 / uu - t1 / uu)
                        svg.corners([
                            Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l17 / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.min(l17, lerp(l17, l28, p)) / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.max(h17, lerp(h17, h28, p)) / vv)),
                            Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h17 / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                        svg.corners([
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.min(l17, lerp(l17, l28, p)) / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.min(l28, lerp(l17, l28, q)) / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.max(h28, lerp(h17, h28, q)) / vv)),
                            Vector2D.mult(u, t1 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, Math.max(h17, lerp(h17, h28, p)) / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                        svg.corners([
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.min(l28, lerp(l17, l28, q)) / vv)),
                            Vector2D.mult(u, t2 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, l28 / vv)),
                            Vector2D.mult(u, t2 / uu + field.size[0] / ul).add(o).add(Vector2D.mult(v, h28 / vv)),
                            Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, Math.max(h28, lerp(h17, h28, q)) / vv))
                        ].map(({x,y}) => [x,y]), "pink")
                    }
                }
                i += 1
            }
        }
        return strips
    }

    // All 1D vert lines > field size
    static forFields1D(o, [u, ul], [v, vl], obstructions, field, svg) {
        // Filter only obstructions that intersects with area.
        const area = Rect.fromOUV(o, [u, ul], [v, vl])
        const obs = obstructions.filter(obs => !obs.disjoint(area))
                                .map(obs => obs.edges.map(([p, w]) => [Vector2D.sub(p, o).dot(u), p, w]))

        // Only record effective events.
        const addEvent = (events, t, data) => {
            if (!events.has(t)) events.set(t, [])
            events.get(t).push(data)
        }
        const enters = new Map()
        const leaves = new Map()
        const uu = ul * ul
        for (const tpws of obs) {
            for (const [i, tpw] of tpws.entries()) {
                const [t1] = tpws[i + 1 & 3]
                if (tpw[0] == t1) continue // vertical line
                const minT = Math.min(tpw[0], t1)
                const maxT = Math.max(tpw[0], t1)
                if (maxT <= 0 || minT >= uu) continue
                addEvent(enters, minT, tpw)

                // Can skip leaving because sweepline will end right there.
                if (maxT < uu) addEvent(leaves, maxT, tpw)
            }
        }
        print("geom trapezoidal decomposition extracted events\n")

        // Sweepline changes states in these intersection points.
        // 0 <= ts < uu
        const ts = new Set([0])
        for (const tpws of enters.values()) {
            for (const [, p, w] of tpws) {
                // If no intersection, uu * false is a safe no op
                const floor = uu * vectorIntersection(u, Vector2D.sub(p, o), w)
                if (0 < floor && floor < uu) ts.add(floor)
                const ceiling = uu * vectorIntersection(u, Vector2D.sub(p, o).sub(v), w)
                if (0 < ceiling && ceiling < uu) ts.add(ceiling)
                for (const tqcs of enters.values()) {
                    for (const [, q, c] of tqcs) {
                        // self intersection is no op
                        const k = vectorIntersection(w, Vector2D.sub(q, p), c)
                        if (k === false) continue
                        const t = Vector2D.mult(w, k).add(p).sub(o).dot(u)
                        if (0 < t && t < uu) ts.add(t)
                    }
                }
            }
        }
        guarantees(Array.from(ts).every(t => 0 <= t && t < uu), "0 <= ts < uu")

        // Works for both floor and ceiling.
        const y = ([tp, p, w], t) => Vector2D.mult(w, (t - tp) / w.dot(u))
                                             .add(p).sub(o).dot(v)

        const timeline = Array.from(ts.union(new Set(enters.keys()))
                                      .union(new Set(leaves.keys())))
                              .sort((a, b) => a - b)
        const edges = new Map()
        const trapeziums = []
        const vv = vl * vl
        const svv = field.size[0] * vl
        guarantees(svv * 2 > vv, "at most one field in one vert line, simplifies our algo")
        for (const [i, t0] of timeline.entries()) {
            leaves.get(t0)?.forEach(edge => edges.delete(edge))
            enters.get(t0)?.forEach(edge => edges.set(edge, t0))
            if (t0 < 0) continue
            const t1 = timeline[i + 1] || uu

            // Within t0 and t1, theoretically there should not be any intersections.
            // However, floating-point error could create intersections.
            // We sort those edges carefully.
            // Ceilings will not be higher than vv because they can be ignored.
            // However, floors may fall below 0 because they still have effect
            // to the ceilings above.
            const ydys = Array.from(edges, ([tpw, minT]) => [y(tpw, t0), minT == tpw[0] ? 1 : -1, y(tpw, t1)])
                              .filter(([y0, , y1]) => y0 - vv + y1 - vv < 0)
                              .concat([[0, 0, 0]])
                              .sort(([l0, , l1], [h0, , h1]) => l0 - h0 + l1 - h1)
            // if (svg) {
            //     for (const [j, [l0, d, l1]] of ydys.entries()) {
            //         const [h0, , h1] = ydys[j + 1] || [vv, 0, vv]
            //         svg.corners([
            //             Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, l0 / vv)),
            //             Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l1 / vv)),
            //             Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h1 / vv)),
            //             Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, h0 / vv))
            //         ].map(({x,y}) => [x,y]), j % 2 == 0 ? "blue" : "orange", 0.5)
            //     }
            // }

            let count = 0
            for (const [j, [l0, d, l1]] of ydys.entries()) {
                count += d
                if (count > 0) continue
                const [h0, , h1] = ydys[j + 1] || [vv, 0, vv]
                if (h0 - l0 > svv && h1 - l1 > svv) {
                    trapeziums.push([t0, l0, h0, t1, l1, h1])
                } else if (h0 - l0 > svv) {
                    const t = t1 - (t1 - t0) * (svv - (h1 - l1)) / (h0 - l0 - (h1 - l1))
                    const p = (t1 - t) / (t1 - t0)
                    const l = lerp(l0, l1, p)
                    const h = lerp(h0, h1, p)
                    trapeziums.push([t0, l0, h0, t, l, h])
                } else if (h1 - l1 > svv) {
                    const t = t0 + (t1 - t0) * (svv - (h0 - l0)) / (h1 - l1 - (h0 - l0))
                    const p = (t1 - t) / (t1 - t0)
                    const l = lerp(l0, l1, p)
                    const h = lerp(h0, h1, p)
                    trapeziums.push([t, l, h, t1, l1, h1])
                }
            }
        }

        // It is mostly sorted but some corner cases would require sorting.
        trapeziums.sort(([t], [s]) => t - s)

        return trapeziums
    }

    // All 1D vert line can also place a 2D field
    static forFields2D(trapeziums, suu, svv) {
        if (trapeziums.length == 0) return []
        const strips = []
        let sweepline = trapeziums[0]
        let left = 0, right = 0
        while (right < trapeziums.length) {
            const [t0, l0, h0, t3, l3, h3] = trapeziums[left]
            const [t1, l1, h1] = sweepline
            const [t6, l6, h6, t9, l9, h9] = trapeziums[right]
            guarantees(t1 < t3, "because we would have incremented left at the moment t1 just reaches t3")

            // This would miss the case of a single strip of t9 - t1 == suu.
            // Should be fine to miss though, such case is too tight.
            // if (t9 - t1 <= suu) { LOL this doesn't work due to precision!
            if (t9 - suu <= t1) {
                if (right == trapeziums.length - 1) break
                right += 1
                if (trapeziums[right][0] == t9) continue

                // Not continuous, start a new strip.
                left = right
                sweepline = trapeziums[left]
                continue
            }

            // When left == right, this part is neatly no op.
            const floor = Math.max(...trapeziums.slice(left, right).map(z => z[4]),
                                   ...trapeziums.slice(left + 1, right + 1).map(z => z[1]))
            const ceiling = Math.min(...trapeziums.slice(left, right).map(z => z[5]),
                                   ...trapeziums.slice(left + 1, right + 1).map(z => z[2]))
            if (ceiling - floor <= svv) {
                guarantees(left < right, "otherwise ceiling - floor would be Infinity")
                left += 1
                sweepline = trapeziums[left]
                continue
            }

            const t7 = t1 + suu
            const p7 = (t9 - t7) / (t9 - t6)
            const l7 = lerp(l6, l9, p7)
            const h7 = lerp(h6, h9, p7)
            const l17 = Math.max(l1, floor, l7)
            const h17 = Math.min(h1, ceiling, h7)

            const ts = [t3, t9 - suu]
            if (l0 > l3) ts.push((t3 - t0) * (l0 - floor) / (l0 - l3))
            if (h3 > h0) ts.push((t3 - t0) * (ceiling - h0) / (h3 - h0))
            if (l9 > l6) ts.push(t9 - (t9 - t6) * (l9 - floor) / (l9 - l6) - suu)
            if (h6 > h9) ts.push(t9 - (t9 - t6) * (ceiling - h9) / (h6 - h9) - suu)
            if (l0 > l3 && l9 > l6) {
                const p = (t3 - t0) / (l0 - l3)
                const q = (t9 - t6) / (l9 - l6)
                ts.push((t9 - t0 + (l0 - l9) * q - suu) * p / (p + q))
            }
            if (h3 > h0 && h6 > h9) {
                const p = (t3 - t0) / (h3 - h0)
                const q = (t9 - t6) / (h6 - h9)
                ts.push((t9 - t0 + (h9 - h0) * q - suu) * p / (p + q))
            }

            const t2 = Math.min(...ts.filter(t => t > t1))
            const p2 = (t3 - t2) / (t3 - t0)
            const l2 = lerp(l0, l3, p2)
            const h2 = lerp(h0, h3, p2)
            const t8 = t2 + suu
            const p8 = (t9 - t8) / (t9 - t6)
            const l8 = lerp(l6, l9, p8)
            const h8 = lerp(h6, h9, p8)
            const l28 = Math.max(l2, floor, l8)
            const h28 = Math.min(h2, ceiling, h8)
            if (h17 - l17 > svv && h28 - l28 > svv) {
                strips.push([t1, l17, h17, t2, l28, h28])
                if (t2 == t3) {
                    guarantees(left < right, `${left} ${right} ${t1} ${t2} ${t3} ${t9 - suu} ${t9 - t1 <= suu} ${t9 - suu <= t1}`)
                    left += 1
                    sweepline = trapeziums[left]
                } else {
                    sweepline = [t2, l2, h2]
                }
            } else if (h17 - l17 > svv) {
                const p = (svv - (h28 - l28)) / (h17 - l17 - (h28 - l28))
                const t = lerp(t1, t2, p)
                const l = lerp(l17, l28, p)
                const h = lerp(h17, h28, p)
                guarantees(t > t1, "otherwise would loop forever")
                strips.push([t1, l17, h17, t, l, h])
                sweepline = [t, l, h]
            } else if (h28 - l28 > svv) {
                const p = (svv - (h17 - l17)) / (h28 - l28 - (h17 - l17))
                const t = lerp(t2, t1, p)
                const l = lerp(l17, l28, p)
                const h = lerp(h17, h28, p)
                strips.push([t, l, h, t2, l28, h28])
                if (t2 == t3) {
                    guarantees(left < right, `${left} ${right} ${t1} ${t2} ${t3} ${t9 - suu} ${t9 - t1 <= suu} ${t9 - suu <= t1}`)
                    left += 1
                    sweepline = trapeziums[left]
                } else {
                    sweepline = [t2, l2, h2]
                }
            } else {
                if (t2 == t3) {
                    guarantees(left < right, `${left} ${right} ${t1} ${t2} ${t3} ${t9 - suu} ${t9 - t1 <= suu} ${t9 - suu <= t1}`)
                    left += 1
                    sweepline = trapeziums[left]
                } else {
                    sweepline = [t2, l2, h2]
                }
            }
        }
        const groups = []
        for (const strip of strips) {
            if (groups.at(-1)?.at(-1)?.[3] == strip[0]) {
                groups.at(-1).push(strip)
            } else {
                groups.push([strip])
            }
        }
        return groups
    }

    static exhaust(edgeId, strip, field, suu, euu, ueu, ul, vl) {
        const [t0, , h0, , , ] = strip[0]
        const [, , , t9, , h9] = strip.at(-1)
        // print(`debug exhausting edge ${edgeId} ${JSON.stringify(strip)}\n`)
        if (t0 < euu && t9 <= ueu - suu) {
            // print("debug case 1\n")
            const n = Math.max(0, Math.ceil((t9 - euu) / suu))
            const m = Math.ceil((t9 - t0) / suu)
            const s = [Constraint.none(n)]
            if (m == n) return s
            guarantees(m == n + 1, "at most one field extend")
            const t = t9 - n * suu
            guarantees(euu > t, "must extend something")
            s.push(Constraint.ext(m, edgeId, (euu - t) / ul))
            const [h, ht] = strip.map(Slope.fromH).map(slope => {
                if (slope.t0 >= t) return [-Infinity]
                if (slope.t9 <= t) return slope.max()
                return new Slope(slope.t0, slope.h0, t, slope.h(t)).max()
            }).sort(([h0], [h1]) => h1 - h0)[0]
            s.push(Constraint.rise(m, edgeId, field.size[1], h / vl))
            return s
        } else if (euu <= t0 && ueu - suu < t9) {
            // print("debug case 2\n")
            const n = Math.max(0, Math.floor((ueu - t0) / suu))
            const m = Math.ceil((t9 - t0) / suu)
            const s = [Constraint.none(n)]
            if (m == n) return s
            guarantees(m == n + 1, "at most one field extend")
            guarantees(t0 + m * suu > ueu, "must extend something")
            s.push(Constraint.ext(m, edgeId + 1 & 3, (t0 + m * suu - ueu) / ul))
            const t = t0 + n * suu
            const [h, ht] = strip.map(Slope.fromH).map(slope => {
                if (slope.t9 <= t) return [-Infinity]
                if (slope.t0 >= t) return slope.max()
                return new Slope(t, slope.h(t), slope.t9, slope.h9).max()
            }).sort(([h0], [h1]) => h1 - h0)[0]
            s.push(Constraint.rise(m, edgeId + 1 & 3, field.size[1], h / vl))
            return s
        } else if (t0 < euu && ueu - suu < t9) {
            // print("debug case 3\n")
            const n = Math.floor((ueu - euu) / suu) // TODO: quite tight actually, eps might be needed
            const m = Math.ceil((t9 - t0) / suu)
            const s = [Constraint.none(n)]
            if (m == n) return s
            guarantees(m == n + 1 || m == n + 2, "at most two fields extend")

            // Extend both sides.
            for (let i = n + 1; i <= m; i++) {
                const t1 = Math.max(t0, ueu - i * suu)
                const t2 = Math.min(t9 - (i - 1) * suu, euu)
                s.push(Constraint.extExt(i, edgeId, (euu - t1) / ul, (euu - t2) / ul, (t1 + i * suu - ueu) / ul, (t2 + i * suu - ueu) / ul))
            }

            const riseEnd = (n, t1Bound, t2Bound, f) => {
                let ht = [-Infinity]
                for (const slope of strip.toReversed().map(Slope.fromH)) {
		    const t1 = Math.max(slope.t0, t1Bound + (n - 1) * suu, ueu - suu)
		    const t2 = Math.min(slope.t9, t2Bound + (n - 1) * suu)
                    if (t1 > t2) {
                        ht = slope.max()
                        continue
                    }
                    const h1 = slope.h(t1)
                    const h2 = slope.h(t2)
                    if (h1 > ht[0] && h1 > h2) {
                        const p = (h1 - Math.max(ht[0], h2)) / (h1 - h2)
                        const t = lerp(t2, t1, p)
                        const h = slope.h(t)
                        const tBound = lerp(t2Bound, t1Bound, p)
                        f(t1Bound, tBound, h1, t1, h, t)
                        if (t < t2) f(tBound, t2Bound, ht[0], ht[1], ht[0], ht[1])
                    } else if (h2 > ht[0]) {
                        f(t1Bound, t2Bound, h2, t2, h2, t2)
                    } else {
                        f(t1Bound, t2Bound, ht[0], ht[1], ht[0], ht[1])
                    }
                    ht = slope.max()
		}
            }

            // print("rise end, extend begin\n")
            for (let i = n + 1; i <= m; i++) {
                riseEnd(i, t0 + (i - 1) * suu, euu + (i - 1) * suu, (t1, t2, h3, t3, h4, t4) => {
                    if (t3 > t2) return
                    s.push(Constraint.extRise(i, edgeId, field.size[1], (euu - Math.min(euu, (t3 - (i - 1) * suu))) / ul, (euu - Math.min(euu, (t4 - (i - 1) * suu))) / ul, h3 / vl, h4 / vl))
                })
            }

            // print("rise begin, extend / rise end\n")
            let ht = [-Infinity]
            for (const slope of strip.map(Slope.fromH)) {
                for (let i = n + 1; i <= m; i++) {
                    const t1 = Math.max(slope.t0, ueu - i * suu)
                    const t2 = Math.min(slope.t9, t9 - (i - 1) * suu, euu)
                    if (t1 > t2) continue
                    const h1 = slope.h(t1)
                    const h2 = slope.h(t2)
                    if (h2 > ht[0] && h2 > h1) {
                        const p = (h2 - Math.max(ht[0], h1)) / (h2 - h1)
                        const t = lerp(t1, t2, p)
                        const h = slope.h(t)
                        s.push(Constraint.riseExt(i, edgeId, field.size[1], h / vl, h2 / vl, (t + i * suu - ueu) / ul, (t2 + i * suu - ueu) / ul))
                        riseEnd(i, t, t2, (t1, t2, h3, t3, h4, t4) => {
                            s.push(Constraint.riseRise(i, edgeId, field.size[1], slope.h(t1) / vl, slope.h(t2) / vl, h3 / vl, h4 / vl))
                        })
                    } else if (h1 > ht[0]) {
                        s.push(Constraint.riseExt(i, edgeId, field.size[1], h1 / vl, h1 / vl, (t1 + i * suu - ueu) / ul, (t1 + i * suu - ueu) / ul))
                        riseEnd(i, t1, t1, (t1, t2, h3, t3, h4, t4) => {
                            s.push(Constraint.riseRise(i, edgeId, field.size[1], slope.h(t1) / vl, slope.h(t2) / vl, h3 / vl, h4 / vl))
                        })
                    }
                }
                ht = slope.max()
            }
            return s
        } else {
            // print("debug case 4\n")
            guarantees(euu <= t0 && t9 <= ueu - suu, "not interfering any corners")
            const n = Math.ceil((t9 - t0) / suu)
            return [Constraint.none(n)]
        }
    }
}

export function fieldPlacements(dropsite, obstructions, field, svg) {
    const gap = (0.8 + 2) * 2
    const extension = field.size[0] - 0.8 * Math.sqrt(2) * (field.maxGatherers - 1)
    const vl = field.size[0] + gap
    const vv = vl * vl
    const svv = field.size[0] * vl

    const areas = []
    for (const [edgeId, oul] of dropsite.rect.edges.entries()) {
        const v = oul[1].perpendicular().mult(-vl / oul[2])
        const ul = oul[2] + 2 * extension
        const u = Vector2D.mult(oul[1], ul / oul[2])
        const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
        areas.push(Rect.fromOUV(o, [u, ul], [v, vl]))
    }
    // if (svg) {
    //     svg.rect(Rect.fromCenter(new Vector2D(...dropsite.position), dropsite.rect.edges.slice(0, 2).map(([,,l]) => l + gap * 2), dropsite.angle, dropsite.cos, 0), "black")
    //     svg.rect(dropsite.rect, "silver")
    //     obstructions.filter(obs => !areas.some(area => !obs.disjoint(area)))
    //                 .forEach(obs => svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "silver", 1))
    //     obstructions.filter(obs => areas.some(area => !obs.disjoint(area)))
    //                 .forEach(obs => svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "grey", 1))
    // }

    const printVector = v => `new Vector2D(${v.x},${v.y})`
    print("geom field placements start\n")
    print(`const mockDropsite = {\n`)
    print(`  position: ${JSON.stringify(dropsite.position)},\n`)
    print(`  angle: ${dropsite.angle},\n`)
    print(`  cos: ${dropsite.cos},\n`)
    print(`  rect: new geom.Rect([${dropsite.rect.edges.map(ouv => printVector(ouv[0])).join(", ")}],\n`)
    print(`                      [${printVector(dropsite.rect.edges[0][1])}, ${dropsite.rect.edges[0][2]}],\n`)
    print(`                      [${printVector(dropsite.rect.edges[1][1])}, ${dropsite.rect.edges[1][2]}])\n`)
    print(`}\n`)
    print(`const mockObstructions = [\n`)
    for (const obs of obstructions.filter(obs => areas.some(area => !obs.disjoint(area)))) {
        print(`  new geom.Rect([${obs.edges.map(ouv => printVector(ouv[0])).join(", ")}],\n`)
        print(`                [${printVector(obs.edges[0][1])}, ${obs.edges[0][2]}],\n`)
        print(`                [${printVector(obs.edges[1][1])}, ${obs.edges[1][2]}]),\n`)
    }
    print(`]\n`)
    print(`const mockField = {\n`)
    print(`  maxGatherers: ${field.maxGatherers},\n`)
    print(`  size: ${JSON.stringify(field.size)}\n`)
    print(`}\n`)

    const allStrips = []
    for (const [edgeId, oul] of dropsite.rect.edges.entries()) {
        const v = oul[1].perpendicular().mult(-vl / oul[2])
        const ul = oul[2] + 2 * extension
        const uu = ul * ul
        const u = Vector2D.mult(oul[1], ul / oul[2])
        const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
        const suu = field.size[0] * ul
        const euu = extension * ul
        const ueu = (oul[2] + extension) * ul
        for (const strip of TrapezoidalStrip.forFields(o, [u, ul], [v, vl], obstructions, field, svg)) {
            allStrips.push([edgeId, strip, TrapezoidalStrip.exhaust(edgeId, strip, field, suu, euu, ueu, ul, vl)])
        }
    }
    print("geom field placements trapezoidal decomposition finished\n")
    for (const [stripId, [edgeId, strip, exhausts]] of allStrips.entries()) {
        print(`strip ${stripId} on edge ${edgeId}: ${JSON.stringify(strip)}\n`)
        for (const exhaust of exhausts) {
            print(`    ${JSON.stringify(exhaust)}\n`)
        }
    }

    let best = [0, 0]
    let iteration = 0
    let breakpoint = null
    const branch = (stripId, total, constraints) => {
        if (iteration == breakpoint) return
        const consistent = Constraint.consistent(constraints)
        if (!consistent) return
        if (stripId == allStrips.length) {
            iteration++
            if (breakpoint != null) {
                const [penalty, centers] = Constraint.consolidate(dropsite.rect.edges, field, consistent, allStrips)
                print(`iteration ${iteration}, total ${total}, penalty ${penalty}\n`)
                if (iteration == breakpoint) {
                    for (const [stripId, constraint] of constraints.entries()) {
                        print(`constraint ${stripId} ${JSON.stringify(constraint)}\n`)
                    }
                    best = [total, penalty, centers]
                    return
                }
            }

            if (total < best[0]) return
            const [penalty, centers] = Constraint.consolidate(dropsite.rect.edges, field, consistent, allStrips)
            if (total > best[0] || total == best[0] && penalty < best[1]) {
                best = [total, penalty, centers]
                print(`subbest ${iteration} total ${total}, penalty ${penalty}\n`)
                for (const [stripId, constraint] of constraints.entries()) {
                    print(`constraint ${stripId} ${JSON.stringify(constraint)}\n`)
                }
            }
            return
        }
        const [edgeId, , exhausts] = allStrips[stripId]
        for (const constraint of exhausts) {
            print(`branch ${stripId} ${JSON.stringify(constraint)}\n`)
            branch(stripId + 1, total + constraint.n, constraints.concat([constraint]))
        }
    }
    branch(0, 0, [])
    print(`best: ${best[0]} penalty: ${best[1]}\n`)

    for (const p of best[2]) {
        svg.rect(Rect.fromCenter(p, field.size, dropsite.angle, dropsite.cos, -0.05), "yellow", 0.8)
    }
    return best[2]
}
