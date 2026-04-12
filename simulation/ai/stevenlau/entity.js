const entityKeys = new Set(["owner", "position", "angle"])
const templateKeys = new Set(["Identity/GenericName",
                              "Obstruction/Static/@width",
                              "Obstruction/Static/@depth"])

function maybeNumber(x) {
    if (x === undefined) return null
    return +x
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
            size: [maybeNumber(fullTemplate.Obstruction?.Static?.["@width"]),
                   maybeNumber(fullTemplate.Obstruction?.Static?.["@depth"])],
            resourceSupplyType: fullTemplate.ResourceSupply?.Type,
            classes: new Set(fullTemplate.Identity?.VisibleClasses?._string?.split(" ") ?? [])
        }
        this.templatesCache.set(this.templateName, template)
        return template
    }

    get amount() {
        return this.amountCache ??= SimEngine.QueryInterface(this.id, Sim.IID_ResourceSupply).GetCurrentAmount()
    }

    get sin() {
        return this.sinCache ??= Math.sin(this.angle)
    }

    get cos() {
        return this.cosCache ??= Math.cos(this.angle)
    }
}

