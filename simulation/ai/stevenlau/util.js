export function dd(x) {
    return Math.round(x * 100) / 100
}

export function entitywhxya(e) {
    const degree = Math.round(180 * e.angle / Math.PI)
    return `${dd(e.template.size[0])}x${dd(e.template.size[1])}+${dd(e.position[0])}+${dd(e.position[1])}o${degree}`
}

export function sum(xs) {
    return xs.reduce((acc, x) => acc + x, 0)
}

export function placementResult(template, {x, y: z}, angle, playerID) {
    const ent = SimEngine.AddLocalEntity(template)
    const pos = SimEngine.QueryInterface(ent, Sim.IID_Position)
    pos.JumpTo(x, z)
    pos.SetYRotation(angle)
    const cmpOwnership = SimEngine.QueryInterface(ent, Sim.IID_Ownership)
    cmpOwnership.SetOwner(playerID)
    const cmpBuildRestrictions = SimEngine.QueryInterface(ent, Sim.IID_BuildRestrictions)
    const result = cmpBuildRestrictions.CheckPlacement()
    SimEngine.DestroyEntity(ent)
    if (result.success) return null
    if (result.message == "%(name)s cannot be built on another building or resource") return "obstructed"
    return result.message
}

export class SVGPrinter {
    constructor([x, z]) {
        this.x = x
        this.z = z
        this.s = []
    }

    dx(x) {
        return dd(500 + (x - this.x) * 3)
    }

    dz(z) {
        return dd(500 - (z - this.z) * 3)
    }

    rect(r, fill = "black", opacity = 1, s = null) {
        this.corners(r.edges.map(([{x,y}]) => [x,y]), fill, opacity, s)
    }

    corners(cs, fill = "black", opacity = 1, s = null) {
        const t = cs.map(([x, z]) => `${this.dx(x)} ${this.dz(z)}`)
        this.s.push(`<polyline points="${t}" stroke="none" fill="${fill}" opacity="${dd(opacity)}" />`)
        if (s) this.text(cs[0], s)
    }

    text([x, z], s) {
        this.s.push(`<text x="${this.dx(x)}" y="${this.dz(z)}" text-anchor="middle"  dominant-baseline="middle" font-size="5">${s}</text>`)
    }

    print() {
        print(`<svg width="1000" height="1000" version="1.1" xmlns="http://www.w3.org/2000/svg">`)
        print(`<rect width="100%" height="100%" fill="palegreen" />`)
        this.s.forEach(s => print(s))
        print("</svg>\n")
    }
}

