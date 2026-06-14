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
            const t1s = this.edges.map(([o]) => o.dot(normal));
            const t2s = rect.edges.map(([o]) => o.dot(normal));
            const [l1, r1] = [Math.min(...t1s), Math.max(...t1s)];
            const [l2, r2] = [Math.min(...t2s), Math.max(...t2s)];
            return r1 < l2 || r2 < l1;
        });
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

export function fieldPlacements(field, strips, eps) {
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

export class TrapezoidalStrip {
    constructor(o, [u, ul], [v, vl], obstructions, field, svg) {
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

        // Sweepline changes states in these intersection points.
        // 0 <= ts < uu
        const ts = new Set([0])
        for (const tpws of enters.values()) {
            for (const [, p, w] of tpws) {
                // Since ts includes 0, ts.add(uu * false) is no op
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
                for (const [j, [l0, d, l1]] of ydys.entries()) {
                    const [h0, , h1] = ydys[j + 1] || [vv, 0, vv]
                    svg.corners([
                        Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, l0 / vv)),
                        Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, l1 / vv)),
                        Vector2D.mult(u, t1 / uu).add(o).add(Vector2D.mult(v, h1 / vv)),
                        Vector2D.mult(u, t0 / uu).add(o).add(Vector2D.mult(v, h0 / vv))
                    ].map(({x,y}) => [x,y]), j % 2 == 0 ? "blue" : "orange", 0.5)
                }
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
        trapeziums.sort(([t], [s]) => t - s)
        const strips = this.getStrips(trapeziums, field.size[0] * ul, field.size[0] * vl)
        if (svg) {
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
                    ].map(({x,y}) => [x,y]), "pink", i % 2 == 0 ? 0.8 : 0.7)
                }
                i += 1
            }
        }
    }

    getStrips(trapeziums, suu, svv) {
        if (trapeziums.length == 0) return []
        const strips = []
        let sweepline = trapeziums[0]
        let left = 0, right = 0
        while (right < trapeziums.length) {
            const [t0, l0, h0, t3, l3, h3] = trapeziums[left]
            const [t1, l1, h1] = sweepline
            const [t6, l6, h6, t9, l9, h9] = trapeziums[right]
            guarantees(t1 < t3, "because we would have incremented left at the moment t1 just reaches t3")

            // This would skip the case of a single strip of t9 - t1 == suu.
            // Should be fine to skip though, such case is too tight.
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
                warn(`sweep a ${JSON.stringify(strips.at(-1))}`)
            } else if (h17 - l17 > svv) {
                const t = t2 - (t2 - t1) * (svv - (h28 - l28)) / (h17 - l17 - (h28 - l28))
                const p = (t2 - t) / (t2 - t1)
                const l = l17 * p + l28 * (1 - p)
                const h = h17 * p + h28 * (1 - p)
                strips.push([t1, l17, h17, t, l, h])
                sweepline = [t, l, h]
                warn(`sweep b ${JSON.stringify(strips.at(-1))}`)
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
                warn(`sweep c ${JSON.stringify(strips.at(-1))}`)
            } else {
                if (t2 == t3) {
                    guarantees(left < right, `${left} ${right} ${t1} ${t2} ${t3} ${t9 - suu} ${t9 - t1 <= suu} ${t9 - suu <= t1}`)
                    left += 1
                    sweepline = trapeziums[left]
                } else {
                    sweepline = [t2, l2, h2]
                }
                warn(`sweep d`)
            }
        }
        const groups = []
        for (const strip of strips) {
            if (groups.at(-1)?.[3] == strip[0]) {
                groups.at(-1).push(strip)
            } else {
                groups.push([strip])
            }
        }
        warn(JSON.stringify(groups))
        return groups
    }
}
