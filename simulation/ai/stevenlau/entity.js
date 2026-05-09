import * as geom from "simulation/ai/stevenlau/geom.js"

const entityKeys = new Set(["owner", "position", "angle"])

export class Entity {
    constructor(id, entity, templateCache) {
        this.id = id
        this.templateName = entity.template
        this.templateCache = templateCache
        this.update(entity)
        this.amountCache = null
        this.cosCache = null
        this.rectCache = null
    }

    update(entity) {
        Object.entries(entity)
              .filter(([k, v]) => entityKeys.has(k))
              .forEach(([k, v]) => this[k] = v)
    }

    pos() {
        return new Vector2D(...this.position)
    }

    get template() {
        return this.templateCache.getOrLoad(this.templateName)
    }

    get amount() {
        return this.amountCache ??= SimEngine.QueryInterface(this.id, Sim.IID_ResourceSupply).GetCurrentAmount()
    }

    get cos() {
        return this.cosCache ??= Math.cos(this.angle)
    }

    get rect() {
        return this.rectCache ??= geom.Rect.fromCenter(this.pos(), this.template.size, this.angle, this.cos, 0)
    }

    obstruction(eps) {
        return geom.Rect.fromCenter(this.pos(), this.template.size, this.angle, this.cos, eps)
    }

    obstructions(eps) {
        if (this.template.size) return [this.obstruction(eps)]
        return this.template.obstructions.map(({position: [x, z], size}) => {
            const [u, v] = geom.cosUV(x, z, this.angle, this.cos)
            return geom.Rect.fromCenter(this.pos().add(u).add(v), size, this.angle, this.cos, eps)
        })
    }
}
