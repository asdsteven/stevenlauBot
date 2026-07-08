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

// List of rects like [au, bu], [au, bu], ...
export class Strip {
    constructor(o, [u, ul], [v, vl]) {
        this.o = o
        this.u = u
        this.ul = ul
        this.v = v
        this.vl = vl
        this.clips = [[0, 1]]
    }

    obstructedClip(obstruction) {
        const ks = obstruction.edges.flatMap(([p, w, wl]) => {
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
                    .sort(([a1], [a2]) => a1 - a2)
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

export function fieldStrips(field, extendEnds, dropsite, obstructions, gap, eps) {
    if (field.size[0] != field.size[1]) throw `field is not a square: ${field.size[0]}x${field.size[1]}`
    const size = field.size[0]

    // We first leave a small gap between field and dropsite to pack
    // as many fields as possible.  This number comes from the fact
    // that each farmer is a 0.8 x 0.8 square and they can farm or
    // drop when they are within 2m from target.  After calculating
    // the max number of fields, we would shrink the gap.
    // const gap = (0.8 + 2) * 2 - 2 * eps

    // We allow some part of a field to extend beyond the width of the
    // dropsite.  We still set a limit so that there is enough space
    // for all farmers to farm within the width of dropsite so that
    // they do not have to walk to drop resources.  17.47 for most
    // civ, 15.73 for Han.
    const extension = size - 0.8 * Math.sqrt(2) * (field.maxGatherers - 1) - eps

    return dropsite.rect.edges.map(([o, u, ul], i) => {
        const extendBegin = !extendEnds[i + 3 & 3]
        const extendEnd = extendEnds[i]
        const begin = extendBegin ? extension : gap
        const end = extendEnd ? extension : gap
        const p = Vector2D.sub(o, Vector2D.mult(u, begin / ul))
                          .sub(u.perpendicular().mult(eps / ul))
        const w = Vector2D.mult(u, 1 + (begin + end) / ul)
        const wl = begin + ul + end
        const v = u.perpendicular().mult(-(gap + size) / ul)
        return [new Strip(p, [w, wl], [v, gap + size]).obstruct(obstructions),
                [begin, extendBegin], [begin + ul, extendEnd]]
    })
}

export function fieldPlacementsOld(field, strips, eps) {
    if (field.size[0] != field.size[1]) throw `field is not a square: ${field.size[0]}x${field.size[1]}`
    const size = field.size[0]
    const edges = strips.map(([strip, [begin, extendBegin], [end, extendEnd]]) =>
        [strip, [begin, extendBegin], [end, extendEnd],
         strip.clips.map(([a, b]) => {
             a *= strip.ul
             b *= strip.ul
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
                 // Both ends are of same type, gravity center.
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
    return edges.flatMap(([strip, [begin, extendBegin], [end, extendEnd], clips], i) => clips.flatMap(([n, a, b, sep]) => {
        if (n == 0) return []
        const prevEdge = edges[i + 3 & 3]
        const [, , [prevEnd, prevExtend]] = prevEdge
        const nextEdge = edges[i + 1 & 3]
        const [, [nextBegin, nextExtend]] = nextEdge
        const ps = []
        for (let j = 0; j < n; j++) {
            const k = a + sep + size / 2 + j * (sep + size)
            let gap = 0
            if (k - size / 2 < begin && !prevExtend) {
                const prevClips = prevEdge.at(-1)
                const [, , prevB] = prevClips.at(-1)
                gap = Math.max(0, prevB - prevEnd)
            } else if (k + size / 2 > end && !nextExtend && extendEnd) {
                // if not extendEnd, the next edge should escape for me.
                const nextClips = nextEdge.at(-1)
                const [, nextA] = nextClips[0]
                gap = Math.max(0, nextBegin - nextA)
            }
            ps.push([Vector2D.add(Vector2D.mult(strip.v, (gap + size / 2) / strip.vl),
                                  Vector2D.mult(strip.u, k / strip.ul)).add(strip.o),
                     gap])
        }
        return ps
    }))
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

const STYLE = 0

class TrapezoidalStrip {
    static forFields(o, [u, ul], [v, vl], obstructions, field, svg) {
        const trapeziums = TrapezoidalStrip.forFields1D(o, [u, ul], [v, vl], obstructions, field, svg)
        print("geom trapezoidal decomposition 1D finished\n")
        const strips = TrapezoidalStrip.forFields2D(trapeziums, field.size[0] * ul, field.size[0] * vl, svg)
        print("geom trapezoidal decomposition 2D finished\n")
        if (svg) {
            const uu = ul * ul
            const vv = vl * vl
            let i = 0
            for (const [t0, l0, h0, t1, l1, h1] of trapeziums) {
                svg.corners([
                    Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, l0 / vv)),
                    Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l1 / vv)),
                    Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h1 / vv)),
                    Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, h0 / vv))
                ].map(({x,y}) => [x,y]), "green", i % 2 == 0 ? 0.5 : 0.4)
                i += 1
            }
            i = 0
            for (const strip of strips) {
                for (const slit of strip) {
                    const [t1, l17, h17, t2, l28, h28] = slit
                    svg.corners([
                        Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l17 / vv)),
                        Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, l28 / vv)),
                        Vector2D.mult(u, t2 / uu).add(o).add(Vector2D.mult(v, h28 / vv)),
                        Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h17 / vv))
                    ].map(({x,y}) => [x,y]), "pink", i % 2 == 0 ? 0.8 : 0.6)
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
            if (svg) {
                /* for (const [j, [l0, d, l1]] of ydys.entries()) {
                 *     const [h0, , h1] = ydys[j + 1] || [vv, 0, vv]
                 *     svg.corners([
                 *         Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, l0 / vv)),
                 *         Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l1 / vv)),
                 *         Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h1 / vv)),
                 *         Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, h0 / vv))
                 *     ].map(({x,y}) => [x,y]), j % 2 == 0 ? "blue" : "orange", 0.5)
                 * } */
            }

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
                    const l = l0 * p + l1 * (1 - p)
                    const h = h0 * p + h1 * (1 - p)
                    trapeziums.push([t0, l0, h0, t, l, h])
                } else if (h1 - l1 > svv) {
                    const t = t0 + (t1 - t0) * (svv - (h0 - l0)) / (h1 - l1 - (h0 - l0))
                    const p = (t1 - t) / (t1 - t0)
                    const l = l0 * p + l1 * (1 - p)
                    const h = h0 * p + h1 * (1 - p)
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
            const l7 = l6 * p7 + l9 * (1 - p7)
            const h7 = h6 * p7 + h9 * (1 - p7)
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
            const l2 = l0 * p2 + l3 * (1 - p2)
            const h2 = h0 * p2 + h3 * (1 - p2)
            const t8 = t2 + suu
            const p8 = (t9 - t8) / (t9 - t6)
            const l8 = l6 * p8 + l9 * (1 - p8)
            const h8 = h6 * p8 + h9 * (1 - p8)
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
                const t = t2 - (t2 - t1) * (svv - (h28 - l28)) / (h17 - l17 - (h28 - l28))
                const p = (t2 - t) / (t2 - t1)
                const l = l17 * p + l28 * (1 - p)
                const h = h17 * p + h28 * (1 - p)
                strips.push([t1, l17, h17, t, l, h])
                sweepline = [t, l, h]
            } else if (h28 - l28 > svv) {
                const t = t1 + (t2 - t1) * (svv - (h17 - l17)) / (h28 - l28 - (h17 - l17))
                const p = (t2 - t) / (t2 - t1)
                const l = l17 * p + l28 * (1 - p)
                const h = h17 * p + h28 * (1 - p)
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

    static exhaust(edgeId, strip, suu, euu, ueu, ul, vl) {
        const [t0, l0, h0, , , ] = strip[0]
        const [, , , t9, l9, h9] = strip.at(-1)
        if (t0 < euu && t9 <= ueu - suu) {
            const n = Math.max(0, Math.ceil((t9 - euu) / suu))
            const m = Math.ceil((t9 - t0) / suu)
            const s = [[n, STYLE + 0]]
            if (m == n) return s
            guarantees(m == n + 1, "at most one field extend")
            const t = t9 - n * suu
            guarantees(euu > t, "must extend something")
            s.push([m, STYLE + 1, [edgeId, (euu - t) / ul]])
            const [h, ht] = strip.map(([t0, l0, h0, t1, l1, h1]) => {
                if (t0 >= t) return [-Infinity]
                if (t1 <= t) return h0 > h1 ? [h0, t0] : [h1, t1]
                const p = (t1 - t) / (t1 - t0)
                const h = h0 * p + h1 * (1 - p)
                return h0 > h ? [h0, t0] : [h, t]
            }).sort(([h0], [h1]) => h1 - h0)[0]
            s.push([m, STYLE + 2, [edgeId, h / vl, ht]])
            return s
        } else if (euu <= t0 && ueu - suu < t9) {
            const n = Math.max(0, Math.floor((ueu - t0) / suu)) // TODO: quite tight actually, eps might be needed
            const m = Math.ceil((t9 - t0) / suu)
            const s = [[n, STYLE + 0]]
            if (m == n) return s
            guarantees(m == n + 1, "at most one field extend")
            guarantees(t0 + m * suu > ueu, "must extend something")
            s.push([m, STYLE + 1, [edgeId + 1 & 3, (t0 + m * suu - ueu) / ul]])
            const t = t0 + n * suu
            const [h, ht] = strip.map(([t0, l0, h0, t1, l1, h1]) => {
                if (t1 <= t) return [-Infinity]
                if (t0 >= t) return h0 > h1 ? [h0, t0] : [h1, t1]
                const p = (t1 - t) / (t1 - t0)
                const h = h0 * p + h1 * (1 - p)
                return h1 > h ? [h1, t1] : [h, t]
            }).sort(([h0], [h1]) => h1 - h0)[0]
            s.push([m, STYLE + 2, [edgeId + 1 & 3, h / vl, ht]])
            return s
        } else if (t0 < euu && ueu - suu < t9) {
            const n = Math.floor((ueu - euu) / suu) // TODO: quite tight actually, eps might be needed
            const m = Math.ceil((t9 - t0) / suu)
            const s = [[n, STYLE + 0]]
            if (m == n) return s
            guarantees(m == n + 1 || m == n + 2, "at most two fields extend")

            // Only extend begin.
            const beginT = ueu - (n + 1) * suu
            if (beginT >= t0) {
                s.push([n + 1, STYLE + 1, [edgeId, ((n + 1) * suu - (ueu - euu)) / ul]])
                const [beginH, beginHT] = strip.map(([t0, l0, h0, t1, l1, h1]) => {
                    if (t0 >= beginT) return [-Infinity]
                    if (t1 <= beginT) return h0 > h1 ? [h0, t0] : [h1, t1]
                    const p = (t1 - beginT) / (t1 - t0)
                    const h = h0 * p + h1 * (1 - p)
                    return h0 > h ? [h0, t0] : [h, beginT]
                }).sort(([h0], [h1]) => h1 - h0)[0]
                s.push([n + 1, STYLE + 2, [edgeId, beginH / vl, beginHT]])
            }

            // Only extend end.
            const endT = euu + n * suu
            if (endT <= t9) {
                s.push([n + 1, STYLE + 1, [edgeId + 1 & 3, ((n + 1) * suu - (ueu - euu)) / ul]])
                const [endH, endHT] = strip.map(([t0, l0, h0, t1, l1, h1]) => {
                    if (t1 <= endT) return [-Infinity]
                    if (t0 >= endT) return h0 > h1 ? [h0, t0] : [h1, t1]
                    const p = (t1 - endT) / (t1 - t0)
                    const h = h0 * p + h1 * (1 - p)
                    return h1 > h ? [h1, t1] : [h, endT]
                }).sort(([h0], [h1]) => h1 - h0)[0]
                s.push([n + 1, STYLE + 2, [edgeId + 1 & 3, endH / vl, endHT]])
            }

            // Extend both sides is super complicated.
            const findMonotone = otherEnd => {
                let best = [-Infinity]
                for (const [t0, l0, h0, t1, l1, h1] of strip.toReversed()) {
                    if (h1 > best[0]) best = [h1, t1]
                    if (t1 >= otherEnd && otherEnd >= t0) {
                        const p = (t1 - otherEnd) / (t1 - t0)
                        const h = h0 * p + h1 * (1 - p)
                        if (h > best[0]) return [h, otherEnd]
                        return best
                    }
                    if (h0 > best[0]) best = [h0, t0]
                }
            }
            let ht = [-Infinity]
            const newRecord = (h, t) => {
                ht = [h, t]
                const otherEnd = t + n * suu
                if (otherEnd + suu > ueu && otherEnd + suu <= t9) {
                    s.push([n + 1, STYLE + 3, [h / vl, t, (otherEnd + suu - ueu) / ul]])
                    const otherHT = findMonotone(otherEnd)
                    s.push([n + 1, STYLE + 4, [h / vl, t, otherHT[0] / vl, otherHT[1]]])
                } else if (otherEnd + 2 * suu > ueu && otherEnd + 2 * suu <= t9) {
                    s.push([n + 2, STYLE + 3, [h / vl, t, (otherEnd + 2 * suu - ueu) / ul]])
                    const otherHT = findMonotone(otherEnd + suu)
                    s.push([n + 2, STYLE + 4, [h / vl, t, otherHT[0] / vl, otherHT[1]]])
                }
            }
            for (const [t0, l0, h0, t1, l1, h1] of strip) {
                if (t0 >= euu || t0 + (n + 1) * suu >= t9) break
                if (h0 > ht[0]) newRecord(h0, t0)
                if (t1 <= euu) {
                    if (h1 > ht[0]) newRecord(h1, t1)
                } else {
                    const p = (t1 - euu) / (t1 - t0)
                    const h = h0 * p + h1 * (1 - p)
                    if (h > ht[0]) newRecord(h, euu)
                }
            }
            ht = [-Infinity]
            const otherRecord = (h, t) => {
                ht = [h, t]
                const otherEnd = t - n * suu
                if (otherEnd < euu && otherEnd >= t0) {
                    s.push([n + 1, STYLE + 5, [(euu - otherEnd) / ul, h / vl, t]])
                } else if (otherEnd - suu < euu && otherEnd - suu >= t0) {
                    s.push([n + 2, STYLE + 5, [(euu - (otherEnd - suu)) / ul, h / vl, t]])
                }
            }
            for (const [t0, l0, h0, t1, l1, h1] of strip.toReversed()) {
                if (t1 <= ueu || t1 - (n + 1) * suu <= strip[0][0]) break
                if (h1 > ht[0]) otherRecord(h1, t1)
                if (t0 >= ueu) {
                    if (h0 > ht[0]) otherRecord(h0, t0)
                } else {
                    const p = (t1 - ueu) / (t1 - t0)
                    const h = h0 * p + h1 * (1 - p)
                    if (h > ht[0]) otherRecord(h, ueu)
                }
            }
            s.push([n + 1, STYLE + 6, [(euu - Math.max(t0, ueu - (n + 1) * suu)) / ul, (Math.min(t9 + suu, euu + (n + 1) * suu) - ueu) / ul, ((n + 1) * suu - (ueu - euu)) / ul]])
            if (m == n + 2) s.push([m, STYLE + 6, [(euu - t0) / ul, (t9 + suu - ueu) / ul, (m * suu - (ueu - euu)) / ul]])
            return s
        } else {
            guarantees(euu <= t0 && t9 <= ueu - suu, "not interfering any corners")
            const n = Math.ceil((t9 - t0) / suu)
            return [[n, 0]]
        }
    }
}

export function fieldPlacements(dropsite, obstructions, field, svg) {
    print("geom field placements start\n")
    const gap = (0.8 + 2) * 2
    const extension = field.size[0] - 0.8 * Math.sqrt(2) * (field.maxGatherers - 1)
    const vl = field.size[0] + gap
    const vv = vl * vl
    const svv = field.size[0] * vl

    const areas = []
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
        areas.push(Rect.fromOUV(o, [u, ul], [v, vl]))
        for (const strip of TrapezoidalStrip.forFields(o, [u, ul], [v, vl], obstructions, field, svg)) {
            allStrips.push([edgeId, strip, TrapezoidalStrip.exhaust(edgeId, strip, suu, euu, ueu, ul, vl)])
        }
    }
    if (svg) {
        obstructions.filter(obs => !areas.some(area => !obs.disjoint(area)))
                    .forEach(obs => svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "black", 1))
        obstructions.filter(obs => areas.some(area => !obs.disjoint(area)))
                    .forEach(obs => svg.corners(obs.edges.map(([p]) => [p.x,p.y]), "grey", 1))
    }
    print("geom field placements trapezoidal decomposition finished\n")

    const corners = [[], [], [], []]
    const consistent = corner => {
        if (corner.length <= 1) return true
        guarantees(corner.length == 2, "at most two sides touching one corner")
        guarantees(corner.every(([style]) => style == 1 || style == 2), "corner has 2 styles only")
        if (corner[0][0] == corner[1][0]) return false
        if (corner[0][0] == 1) {
            return corner[0][1] < corner[1][1] - field.size[0]
        } else {
            return corner[0][1] - field.size[0] > corner[1][1]
        }
    }
    let best = [0, 0]
    const f = (stripId, total, penalty, seq, loopback) => {
        // print(`geom field placements f ${stripId}\n`)
        if (stripId == allStrips.length) {
            if (loopback) {
                stripId = 0
            } else {
                if (total > best[0] || total == best[0] && penalty < best[1]) {
                    best = [total, penalty, seq]
                }
                return
            }
        }
        const [edgeId, , exhausts] = allStrips[stripId]
        for (const [n, style, s] of exhausts) {
            if (style == 6) {
                // No consecutive 6 are allowed.
                if (stripId == 1) {
                    if (loopback) continue
                    guarantees(seq.at(-1)[0] != 6, "it is not 6")
                } else if (stripId >= 2) {
                    if (seq.at(-1)[0] == 6) continue
                }

                if (stripId == 0 && !loopback) {
                    // This style is extension on both sides, the strip can
                    // slide with absolute freedom.  We want to process
                    // everything else to contraint this freedom, then come back
                    // to process it.
                    f(stripId + 1, total, penalty, seq, true)
                } else {
                    const [roomBegin, roomEnd, ext] = s
                    if (corners[edgeId].length > 0 && corners[edgeId][0] != 2) return
                    if (corners[edgeId + 1 & 3].length > 0 && corners[edgeId + 1 & 3][0] != 2) return
                    const begin = Math.min(roomBegin, corners[edgeId].length > 0 ? corners[edgeId][1] : Infinity)
                    const end = Math.min(roomEnd, corners[edgeId + 1 & 3].length > 0 ? corners[edgeId + 1 & 3][1] : Infinity)
                    if (begin + end > ext) {
                        corners[edgeId].push([1, begin])
                        corners[edgeId + 1 & 3].push([1, ext - begin])
                        if (stripId == 0) {
                            guarantees(loopback, "loopback done")
                            if (total > best[0] || total == best[0] && penalty < best[1]) {
                                best = [total, penalty, [[6, n, begin, ext - begin]].concat(seq)]
                            }
                        } else {
                            f(stripId + 1, total + n, penalty, seq.concat([[6, n, begin, ext - begin]]), loopback)
                        }
                        corners[edgeId].pop()
                        corners[edgeId + 1 & 3].pop()
                    }
                }
                continue
            }
            if (stripId == 0 && loopback) continue
            if (style == 0) {
                f(stripId + 1, total + n, penalty, seq.concat([[0, n]]), loopback)
            } else if (style == 1) {
                const [cornerId, ext] = s
                corners[cornerId].push([1, ext])
                if (consistent(corners[cornerId])) {
                    f(stripId + 1, total + n, penalty, seq.concat([[1, n, cornerId, ext]]), loopback)
                }
                corners[cornerId].pop()
            } else if (style == 2) {
                const [cornerId, h, t] = s
                corners[cornerId].push([2, h])
                if (consistent(corners[cornerId])) {
                    f(stripId + 1, total + n, penalty + h, seq.concat([[2, n, cornerId, h, t]]), loopback)
                }
                corners[cornerId].pop()
            } else if (style == 3) {
                const [h, t, ext] = s
                corners[edgeId].push([2, h])
                corners[edgeId + 1 & 3].push([1, ext])
                if (consistent(corners[edgeId]) && consistent(corners[edgeId + 1 & 3])) {
                    f(stripId + 1, total + n, penalty + h, seq.concat([[3, n, h, t, ext]]), loopback)
                }
                corners[edgeId].pop()
                corners[edgeId + 1 & 3].pop()
            } else if (style == 4) {
                const [h0, t0, h1, t1] = s
                corners[edgeId].push([2, h0])
                corners[edgeId + 1 & 3].push([2, h1])
                if (consistent(corners[edgeId]) && consistent(corners[edgeId + 1 & 3])) {
                    f(stripId + 1, total + n, penalty + h0 + h1, seq.concat([[4, n, h0, t0, h1, t1]]), loopback)
                }
                corners[edgeId].pop()
                corners[edgeId + 1 & 3].pop()
            } else {
                guarantees(style == 5, `5 + 1 styles only; got ${style}`)
                const [ext, h, t] = s
                corners[edgeId].push([1, ext])
                corners[edgeId + 1 & 3].push([2, h])
                if (consistent(corners[edgeId]) && consistent(corners[edgeId + 1 & 3])) {
                    f(stripId + 1, total + n, penalty + h, seq.concat([[5, n, ext, h, t]]), loopback)
                }
                corners[edgeId].pop()
                corners[edgeId + 1 & 3].pop()
            }
        }
    }
    f(0, 0, 0, [], false)
    print("geom field placements recursion finished\n")
    guarantees(best[2].length == allStrips.length, "seq is allStrips companion")
    print(`best: ${best[0]} penalty: ${best[1]}\n`)
    print(JSON.stringify(best[2]) + "\n")
    const centers = []
    for (const [stripId, [edgeId, strip]] of allStrips.entries()) {
        const oul = dropsite.rect.edges[edgeId]
        const v = oul[1].perpendicular().mult(-vl / oul[2])
        const ul = oul[2] + 2 * extension
        const uu = ul * ul
        const u = Vector2D.mult(oul[1], ul / oul[2])
        const o = Vector2D.mult(oul[1], -extension / oul[2]).add(oul[0])
        const suu = field.size[0] * ul
        const euu = extension * ul
        const ueu = (oul[2] + extension) * ul
        const [style, n] = best[2][stripId]
        const addLowest = t => {
            for (const [t0, l0, h0, t1, l1, h1] of strip) {
                if (t0 <= t && t <= t1) {
                    const p = (t1 - t) / (t1 - t0)
                    const l = l0 * p + l1 * (1 - p) + svv / 2
                    centers.push(Vector2D.mult(u, (t + suu / 2) / uu).add(Vector2D.mult(v, l / vv)).add(o))
                    return
                }
            }
            warn(`did not catch: t = ${t / ul}, stripId = ${stripId}, edgeId = ${edgeId}, t0 = ${strip[0][0] / ul}, t9 = ${strip.at(-1)[3] / ul}, ueu - suu = ${(ueu - suu) / ul}`)
        }
        if (style == 0) {
            const sepuu = (Math.min(strip.at(-1)[3] + suu, ueu) - Math.max(strip[0][0], euu) - n * suu) / (n + 1)
            for (let i = 0; i < n; i++) {
                addLowest(Math.max(strip[0][0], euu) + sepuu + i * (sepuu + suu))
            }
        } else if (style == 1) {
            const [, , cornerId, ext] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (cornerId == edgeId) {
                    addLowest(Math.min(strip.at(-1)[3], ueu - suu) - i * suu)
                } else {
                    guarantees(cornerId == (edgeId + 1 & 3), `edge affect two corners only: style = ${style}, cornerId = ${cornerId}, edgeId = ${edgeId}`)
                    addLowest(Math.max(strip[0][0], euu) + i * suu)
                }
            }
        } else if (style == 2) {
            // TODO: magnet
            const [, , cornerId, h, t] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (cornerId == edgeId) {
                    if (i == 0) {
                        centers.push(Vector2D.mult(u, (t + suu / 2) / uu).add(Vector2D.mult(v, (h - field.size[0] / 2) / vl)).add(o))
                    } else {
                        addLowest(t + i * suu)
                    }
                } else {
                    guarantees(cornerId == (edgeId + 1 & 3), `edge affect two corners only: style = ${style}, cornerId = ${cornerId}, edgeId = ${edgeId}`)
                    if (i == 0) {
                        centers.push(Vector2D.mult(u, (t + suu / 2) / uu).add(Vector2D.mult(v, (h - field.size[0] / 2) / vl)).add(o))
                    } else {
                        addLowest(t - i * suu)
                    }
                }
            }
        } else if (style == 3) {
            const [, , h, t, ext] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (i == 0) {
                    centers.push(Vector2D.mult(u, (t + suu / 2) / uu).add(Vector2D.mult(v, (h - field.size[0] / 2) / vl)).add(o))
                } else {
                    addLowest(t + i * suu)
                }
            }
        } else if (style == 4) {
            const [, , h0, t0, h1, t1] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (i == 0) {
                    centers.push(Vector2D.mult(u, (t0 + suu / 2) / uu).add(Vector2D.mult(v, (h0 - field.size[0] / 2) / vl)).add(o))
                } else if (i == n - 1) {
                    centers.push(Vector2D.mult(u, (t1 + suu / 2) / uu).add(Vector2D.mult(v, (h1 - field.size[0] / 2) / vl)).add(o))
                } else {
                    addLowest(t0 + i * suu)
                }
            }
        } else if (style == 5) {
            const [, , ext, h, t] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (i == 0) {
                    centers.push(Vector2D.mult(u, (t + suu / 2) / uu).add(Vector2D.mult(v, (h - field.size[0] / 2) / vl)).add(o))
                } else {
                    addLowest(t - i * suu)
                }
            }
        } else {
            guarantees(style == 6, "6 styles only")
            const [, , begin, end] = best[2][stripId]
            for (let i = 0; i < n; i++) {
                if (i == 0 && euu - begin * ul < strip[0][0]) {
                    // precision error special case
                    warn(`precision error special case: ${euu - begin* ul} vs ${strip[0][0]}`)
                    addLowest(strip[0][0])
                } else if (i == n - 1) {
                    addLowest(ueu + end * ul - suu)
                } else {
                    addLowest(euu - begin * ul + i * suu)
                }
            }
        }
    }
    for (const p of centers) {
        svg.rect(Rect.fromCenter(p, field.size, dropsite.angle, dropsite.cos, -0.05), "blue")
    }
}
