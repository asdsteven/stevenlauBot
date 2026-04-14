const entityKeys = new Set(["owner", "position", "angle"])
const templateKeys = new Set(["Identity/GenericName",
                              "Obstruction/Static/@width",
                              "Obstruction/Static/@depth"])

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

export class Entity {
    constructor(id, entity, templatesCache) {
        this.id = id
        this.templateName = entity.template
        this.templatesCache = templatesCache
        this.update(entity)
        this.amountCache = null
        this.sinCache = null
        this.cosCache = null
    }

    update(entity) {
        Object.entries(entity)
              .filter(([k, v]) => entityKeys.has(k))
              .forEach(([k, v]) => this[k] = v)
    }

    get template() {
        if (this.templatesCache.has(this.templateName))
            this.templatesCache.get(this.templateName)
        const fullTemplate = Engine.GetTemplate(this.templateName)
        const template = {
            genericName: fullTemplate.Identity.GenericName,
            size: staticObstruction(fullTemplate.Obstruction?.Static),
            obstructions: clusterObstructions(fullTemplate.Obstruction?.Obstructions),
            resourceSupplyType: fullTemplate.ResourceSupply?.Type,
            classes: new Set(fullTemplate.Identity?.VisibleClasses?._string?.split(" ") ?? []).union(
                new Set(fullTemplate.Identity?.Classes?._string?.split(" ") ?? []))
        }
        this.templatesCache.set(this.templateName, template)
        return template
    }

    get amount() {
        return this.amountCache ??= SimEngine.QueryInterface(this.id, Sim.IID_ResourceSupply).GetCurrentAmount()
    }

    get cos() {
        return this.cosCache ??= Math.cos(this.angle)
    }

    pos() {
        return new Vector2D(...this.position)
    }
}

