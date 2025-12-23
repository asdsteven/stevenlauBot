Engine.IncludeModule("common-api");

var STEVENLAU = {};

STEVENLAU.StevenlauBot = function(settings)
{
    API3.BaseAI.call(this, settings);
};

STEVENLAU.StevenlauBot.prototype = Object.create(API3.BaseAI.prototype);

STEVENLAU.StevenlauBot.prototype.CustomInit = function(gameState)
{
    this.state = 0;
};

STEVENLAU.StevenlauBot.prototype.printGenericNames = function() {
    const genericNames = new Map();
    this.gameState.getEntities().forEach(ent => {
        const name = ent.genericName();
        genericNames.set(name, (genericNames.get(name) || 0) + 1);
    });
    genericNames.forEach(([name, count]) => this.chat(`${name}: ${count}`));
};

function roundDD(x) {
    return Math.round(x * 100) / 100;
}

function positionToString([x, z]) {
    return `(${roundDD(x)},${roundDD(z)})`;
}

function pointSegmentDistanceSquared(target, p1, p2) {
    const u = new Vector2D(target[0] - p1[0], target[1] - p1[1]);
    const v = new Vector2D(p2[0] - p1[0], p2[1] - p1[1]);
    const t = u.dot(v) / v.dot(v);
    if (t <= 0) return API3.SquareVectorDistance(target, p1);
    if (1 <= t) return API3.SquareVectorDistance(target, p2);
    return v.mult(t).add(new Vector2D(p1[0], p1[1])).distanceToSquared(new Vector2D(target[0], target[1]));
}

function structureCorners(structure) {
    const [x, z] = structure.position();
    const w = +structure.get("Obstruction/Static/@width");
    const h = +structure.get("Obstruction/Static/@depth");
    const cosa = Math.cos(structure.angle());
    const sina = Math.sin(structure.angle());
    const dxz = [[h,w],[-h,w],[-h,-w],[h,-w],[h,w]];
    return [0,1,2,3].map(i => {
        const [dx1, dz1] = dxz[i];
        const [dx2, dz2] = dxz[i + 1];
        const p1 = [
            x + cosa * 0.5 * dx1 - sina * 0.5 * dz1,
            z + sina * 0.5 * dx1 + cosa * 0.5 * dz1
        ];
        const p2 = [
            x + cosa * 0.5 * dx2 - sina * 0.5 * dz2,
            z + sina * 0.5 * dx2 + cosa * 0.5 * dz2
        ];
        return [p1, p2];
    });
}

function pointStructureDistanceSquared(target, structure) {
    return Math.min(...structureCorners(structure).map(([p1,p2]) => {
        return pointSegmentDistanceSquared(target, p1, p2);
    }));
}

STEVENLAU.StevenlauBot.prototype.firstEntities = function() {
    const entities = {
        women: [],
        crossbowmen: [],
        spearmen: [],
        swordcav: null,
        minister: null,
        cc: null
    };
    this.gameState.getOwnEntities().forEach(ent => {
        const s = ent.genericName();
        if (s == "Female Citizen") entities.women.push(ent);
        else if (s == "Infantry Crossbowman") entities.crossbowmen.push(ent);
        else if (s == "Spearman") entities.spearmen.push(ent);
        else if (s == "Cavalry Swordsman") entities.swordcav = ent;
        else if (s == "Imperial Minister") entities.minister = ent;
        else if (s == "Civic Center") entities.cc = ent;
        else this.chat(`unhandled first entity: ${s}`);
    });
    this.chat(`cc: ${positionToString(entities.cc.position())} ${roundDD(entities.cc.angle())}rad`);
    return entities;
};

STEVENLAU.StevenlauBot.prototype.dropsiteTreeFruitMeat = function(dropsite) {
    const m = new Map();
    const f = supply => {
        const res = supply.resourceSupplyType().specific;
        const dist = pointStructureDistanceSquared(supply.position(), dropsite);
        if (!m.has(res) || dist < m.get(res)[1]) m.set(res, [supply, dist]);
    };
    this.gameState.getResourceSupplies("wood").forEach(f);
    this.gameState.getResourceSupplies("food").forEach(f);
    return ["tree", "fruit", "meat"].map(res => m.get(res)[0]);
}

STEVENLAU.StevenlauBot.prototype.cavMeat = function(cav) {
    let meat = null;
    const f = supply => {
        if (supply.resourceSupplyType().specific != "meat") return;
        const dist = API3.SquareVectorDistance(supply.position(), cav.position())
        if (!meat || dist < meat[1]) meat = [supply, dist];
    };
    this.gameState.getResourceSupplies("food").forEach(f);
    return meat[0];
}

STEVENLAU.StevenlauBot.prototype.OnUpdate = function(gameState)
{
    if (this.state == 0) {
        /* if (this.gameState.getTimeElapsed() < 1000) return; */
        if (this.gameState.getPlayerCiv() != "han") {
            this.chat("stevenlauBot only works for Han.");
            this.state = -1;
            return;
        }
        this.entities = this.firstEntities();
        this.teleporting = new Map();
        const {women, crossbowmen, spearmen, swordcav, minister, cc} = this.entities;
        cc.train(this.gameState.getPlayerCiv(), "units/han/support_female_citizen", 6);
        const [tree, fruit, meat] = this.dropsiteTreeFruitMeat(cc);
        this.fruit = fruit;
        for (const unit of [...women, ...crossbowmen, ...spearmen, minister]) {
            const teleportDist = pointStructureDistanceSquared(unit.position(), cc) +
                                 pointStructureDistanceSquared(tree.position(), cc);
            if (API3.SquareVectorDistance(tree.position(), unit.position()) < teleportDist) {
                unit.gather(tree);
            } else {
                unit.garrison(cc);
                this.teleporting.set(unit.id(), [unit, tree]);
            }
        }
        const chicken = this.cavMeat(swordcav);
        const teleportDist = pointStructureDistanceSquared(swordcav.position(), cc) +
                             pointStructureDistanceSquared(meat.position(), cc);
        if (API3.SquareVectorDistance(chicken.position(), swordcav.position()) < teleportDist) {
            // Walk to chicken nearest to swordcav
            swordcav.gather(chicken);
        } else {
            // Teleport to chicken nearest to CC
            swordcav.garrison(cc);
            this.teleporting.set(swordcav.id(), [swordcav, meat]);
        }
        this.state = 1;
    } else if (this.state == 1) {
        const {women, crossbowmen, spearmen, swordcav, minister, cc} = this.entities;
        for (const id of cc.garrisoned()) {
            if (!this.teleporting.has(id)) {
                this.chat(`unknown garrison: ${id}`);
                continue;
            }
            const [unit, target] = this.teleporting.get(id);
            cc.setRallyPoint(target, "gather");
            cc.unload(id);
            this.teleporting.delete(id);
        }
        if (this.teleporting.size == 0) {
            cc.setRallyPoint(this.fruit, "gather");
            this.state = 2;
        }
    } else if (this.state == 2) {
        const {women, crossbowmen, spearmen, swordcav, minister, cc} = this.entities;
        const [ , , meat] = this.dropsiteTreeFruitMeat(cc);
        if (swordcav.isIdle()) swordcav.gather(meat);
    }
};

