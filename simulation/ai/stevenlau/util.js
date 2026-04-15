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

export function placementResult(template, x, z, angle, playerID) {
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

    rect(ous, fill = "black", opacity = 1) {
        this.corners(ous.map(([o, u]) => o), fill, opacity)
    }

    corners(cs, fill = "black", opacity = 1) {
        const t = cs.map(c => [c.x, c.y])
                    .map(([x, z]) => `${dd(500 + (x - this.x) * 3)} ${dd(500 - (z - this.z) * 3)}`)
        this.s.push(`<polyline points="${t}" stroke="none" fill="${fill}" opacity="${dd(opacity)}" />`)
    }

    print() {
        print(`<svg width="1000" height="1000" version="1.1" xmlns="http://www.w3.org/2000/svg">`)
        this.s.forEach(s => print(s))
        print("</svg>\n")
    }
}

