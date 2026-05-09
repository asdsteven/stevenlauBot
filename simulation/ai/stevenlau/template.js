import * as geom from "simulation/ai/stevenlau/geom.js"

function staticObstruction(obs) {
    if (!obs) return null
    return [+obs["@width"], +obs["@depth"]]
}

function clusterObstructions(obss) {
    if (!obss) return null
    return [obss.Right, obss.Left, obss.Door].map(obs => ({
        position: [+obs["@x"], +obs["@z"]],
        size: [+obs["@width"], +obs["@depth"]]
    }))
}

function maybeNumber(x) {
    if (x === undefined) return null
    return +x
}

function costs(template) {
    if (!template) return null
    return {
        food: template.Resources.food || 0,
        wood: template.Resources.wood || 0,
        stone: template.Resources.stone || 0,
        metal: template.Resources.metal || 0,
    }
}

export class TemplateCache extends Map {
    getOrLoad(name) {
        if (this.has(name)) return this.get(name)
        const template = Engine.GetTemplate(name)
        // TODO: do modfications
        const t = {
            name: name,
            genericName: template.Identity.GenericName,
            size: staticObstruction(template.Obstruction?.Static),
            obstructions: clusterObstructions(template.Obstruction?.Obstructions),
            resourceSupplyType: template.ResourceSupply?.Type,
            maxGatherers: maybeNumber(template.ResourceSupply?.MaxGatherers),
            classes: new Set(template.Identity?.VisibleClasses?._string?.split(" ") ?? []).union(
                new Set(template.Identity?.Classes?._string?.split(" ") ?? [])),
            costs: costs(template.Cost)
        }
        this.set(name, t)
        return t
    }
}
